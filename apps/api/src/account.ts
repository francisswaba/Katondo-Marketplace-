import { Router, type NextFunction, type Response } from 'express';
import type { Pool } from 'pg';
import { staffRoles, type AuthenticatedRequest } from './access.js';
import { recordActivity } from './activity.js';
import { ensurePlatformUser } from './identity.js';

type Authenticate = (request: AuthenticatedRequest, response: Response, next: NextFunction) => Promise<void>;

function isSeller(roles: string[]) {
  return roles.includes('individual_seller') || roles.includes('business_seller');
}

function isStaff(roles: string[]) {
  return staffRoles.some((role) => roles.includes(role));
}

function preferenceResponse(row: Record<string, unknown>, roles: string[]) {
  return {
    locale: row.locale,
    theme: row.theme,
    marketingEmails: row.marketing_emails === true,
    marketplaceUpdates: row.marketplace_updates === true,
    orderUpdates: row.order_updates === true,
    savedSearchAlerts: row.saved_search_alerts === true,
    sellerActivityAlerts: row.seller_activity_alerts === true,
    staffOperationalAlerts: row.staff_operational_alerts === true,
    available: {
      buyer: roles.includes('buyer'),
      seller: isSeller(roles),
      staff: isStaff(roles),
    },
  };
}

export function createAccountRouter(pool: Pool, authenticate: Authenticate) {
  const router = Router();

  router.get('/api/account/settings', authenticate, async (request: AuthenticatedRequest, response) => {
    if (request.user?.actorType === 'ai_agent') {
      response.status(403).json({ error: 'Service agents use machine credential management, not personal account settings.' });
      return;
    }
    try {
      const userId = await ensurePlatformUser(pool, request.user!);
      const result = await pool.query(`
        INSERT INTO user_preferences (user_id) VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING *
      `, [userId]);
      response.json({
        account: {
          displayName: request.user?.displayName,
          email: request.user?.emailVerified ? request.user.email : null,
          phone: request.user?.phoneVerified ? request.user.phone : null,
          roles: request.user?.roles ?? [],
        },
        preferences: preferenceResponse(result.rows[0], request.user?.roles ?? []),
      });
    } catch (error) {
      console.error('Account settings request failed', error);
      response.status(503).json({ error: 'Account settings are temporarily unavailable.' });
    }
  });

  router.put('/api/account/settings', authenticate, async (request: AuthenticatedRequest, response) => {
    if (request.user?.actorType === 'ai_agent') {
      response.status(403).json({ error: 'Service agents use machine credential management, not personal account settings.' });
      return;
    }
    const roles = request.user?.roles ?? [];
    const locale = request.body?.locale;
    const theme = request.body?.theme;
    const booleanFields = ['marketingEmails', 'marketplaceUpdates', 'orderUpdates', 'savedSearchAlerts', 'sellerActivityAlerts', 'staffOperationalAlerts'] as const;
    if (!['en-ZM', 'en'].includes(locale) || !['system', 'light', 'dark'].includes(theme)
      || booleanFields.some((field) => typeof request.body?.[field] !== 'boolean')) {
      response.status(400).json({ error: 'Provide valid account preference values.' });
      return;
    }
    try {
      const userId = await ensurePlatformUser(pool, request.user!);
      const buyer = roles.includes('buyer');
      const seller = isSeller(roles);
      const staff = isStaff(roles);
      const result = await pool.query(`
        INSERT INTO user_preferences (
          user_id, locale, theme, marketing_emails, marketplace_updates, order_updates,
          saved_search_alerts, seller_activity_alerts, staff_operational_alerts
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id) DO UPDATE SET
          locale = EXCLUDED.locale,
          theme = EXCLUDED.theme,
          marketing_emails = EXCLUDED.marketing_emails,
          marketplace_updates = EXCLUDED.marketplace_updates,
          order_updates = CASE WHEN $10 THEN EXCLUDED.order_updates ELSE user_preferences.order_updates END,
          saved_search_alerts = CASE WHEN $10 THEN EXCLUDED.saved_search_alerts ELSE user_preferences.saved_search_alerts END,
          seller_activity_alerts = CASE WHEN $11 THEN EXCLUDED.seller_activity_alerts ELSE user_preferences.seller_activity_alerts END,
          staff_operational_alerts = CASE WHEN $12 THEN EXCLUDED.staff_operational_alerts ELSE user_preferences.staff_operational_alerts END,
          updated_at = NOW()
        RETURNING *
      `, [
        userId, locale, theme, request.body.marketingEmails, request.body.marketplaceUpdates,
        buyer ? request.body.orderUpdates : true,
        buyer ? request.body.savedSearchAlerts : false,
        seller ? request.body.sellerActivityAlerts : true,
        staff ? request.body.staffOperationalAlerts : true,
        buyer, seller, staff,
      ]);
      await recordActivity(pool, request, request.user!.actorType === 'staff' ? 'staff' : request.user!.actorType, 'account.preferences_updated');
      response.json({ preferences: preferenceResponse(result.rows[0], roles) });
    } catch (error) {
      console.error('Account settings update failed', error);
      response.status(503).json({ error: 'Account settings could not be saved.' });
    }
  });

  return router;
}
