import { Router, type NextFunction, type Response } from 'express';
import type { Pool } from 'pg';
import { staffRoles, type AuthenticatedRequest } from './access.js';
import { recordActivity } from './activity.js';
import { ensurePlatformUser } from './identity.js';
import { getMarketConfiguration } from './market.js';
import { accountRestoreDays } from '@katondo/contracts';
import { createSystemSupportCase } from './support.js';

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
  const market = getMarketConfiguration();

  router.get('/api/account/settings', authenticate, async (request: AuthenticatedRequest, response) => {
    if (request.user?.actorType === 'ai_agent') {
      response.status(403).json({ error: 'Service agents use machine credential management, not personal account settings.' });
      return;
    }
    try {
      const userId = await ensurePlatformUser(pool, request.user!);
      const result = await pool.query(`
        INSERT INTO user_preferences (user_id, locale) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING *
      `, [userId, market.locale]);
      response.json({
        account: {
          displayName: request.user?.displayName,
          email: request.user?.emailVerified ? request.user.email : null,
          phone: request.user?.phoneVerified ? request.user.phone : null,
          roles: request.user?.roles ?? [],
          status: request.user?.accountStatus ?? 'active',
          deletionDueAt: request.user?.deletionDueAt ?? null,
        },
        market,
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
    if (!market.supportedLocales.includes(locale) || !['system', 'light', 'dark'].includes(theme)
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

  // Close my account: hidden at once, restorable for 30 days, then anonymised.
  router.post('/api/account/close', authenticate, async (request: AuthenticatedRequest, response) => {
    if (request.user?.actorType === 'ai_agent') return void response.status(403).json({ error: 'Service agents can’t close accounts.' });
    if (request.body?.confirm !== 'CLOSE') return void response.status(400).json({ error: 'Type CLOSE to confirm.' });
    if (isStaff(request.user?.roles ?? [])) {
      return void response.status(409).json({ error: 'Staff accounts are closed by a top administrator when someone leaves Katondo.' });
    }
    const client = await pool.connect();
    try {
      const userId = await ensurePlatformUser(client, request.user!);
      const open = await client.query(`
        SELECT COUNT(*) FROM orders o JOIN sellers s ON s.id = o.seller_id
        WHERE (o.buyer_user_id = $1 OR s.user_id = $1) AND o.status IN ('pending', 'paid', 'dispatched')
      `, [userId]);
      if (Number(open.rows[0].count) > 0) {
        return void response.status(409).json({ error: 'Finish or cancel your open orders before closing your account.' });
      }
      await client.query('BEGIN');
      const updated = await client.query(`
        UPDATE users SET status = 'pending_deletion', deletion_requested_at = NOW(),
          deletion_due_at = NOW() + make_interval(days => $2)
        WHERE id = $1 AND status = 'active' RETURNING deletion_due_at
      `, [userId, accountRestoreDays]);
      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        return void response.status(409).json({ error: 'This account is already being closed.' });
      }
      await client.query(`
        UPDATE listings SET status = 'paused', paused_reason = 'account_closing', updated_at = NOW()
        WHERE status = 'published' AND seller_id IN (SELECT id FROM sellers WHERE user_id = $1)
      `, [userId]);
      await client.query(`INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details) VALUES ($1, 'account.closing_requested', 'user', $1, '{}')`, [userId]);
      await client.query('COMMIT');
      response.json({ status: 'pending_deletion', deletionDueAt: (updated.rows[0].deletion_due_at as Date).toISOString() });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Account closing failed', error);
      response.status(503).json({ error: 'Your account could not be closed. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  // Restore an account that is still within its 30 days.
  router.post('/api/account/restore', authenticate, async (request: AuthenticatedRequest, response) => {
    const client = await pool.connect();
    try {
      const userId = await ensurePlatformUser(client, request.user!);
      await client.query('BEGIN');
      const updated = await client.query(`
        UPDATE users SET status = 'active', deletion_requested_at = NULL, deletion_due_at = NULL
        WHERE id = $1 AND status = 'pending_deletion' AND deletion_due_at > NOW() RETURNING id
      `, [userId]);
      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        return void response.status(409).json({ error: 'This account isn’t waiting to be closed.' });
      }
      await client.query(`
        UPDATE listings SET status = 'published', paused_reason = NULL, updated_at = NOW()
        WHERE paused_reason = 'account_closing' AND seller_id IN (SELECT id FROM sellers WHERE user_id = $1)
      `, [userId]);
      await client.query(`INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details) VALUES ($1, 'account.restored', 'user', $1, '{}')`, [userId]);
      await client.query('COMMIT');
      response.json({ status: 'active' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Account restore failed', error);
      response.status(503).json({ error: 'Your account could not be restored. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  return router;
}

/**
 * Anonymises accounts whose restore period has ended. Records the law may require us to keep
 * (orders, payments, payouts, seller verification, help cases) stay, detached from the person's
 * contact details. Staff get a help case to delete the person's sign-in account at the provider.
 */
export async function purgeClosedAccounts(pool: Pool) {
  const due = await pool.query(`SELECT id, identity_object_id FROM users WHERE status = 'pending_deletion' AND deletion_due_at <= NOW() LIMIT 100`);
  let count = 0;
  for (const row of due.rows as Array<{ id: string; identity_object_id: string | null }>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(`SELECT id FROM users WHERE id = $1 AND status = 'pending_deletion' FOR UPDATE SKIP LOCKED`, [row.id]);
      if (!locked.rowCount) { await client.query('ROLLBACK'); continue; }
      await client.query(`DELETE FROM user_preferences WHERE user_id = $1`, [row.id]);
      await client.query(`DELETE FROM user_blocks WHERE blocker_user_id = $1 OR blocked_user_id = $1`, [row.id]);
      await client.query(`DELETE FROM activity_events WHERE actor_user_id = $1`, [row.id]);
      await client.query(`UPDATE messages SET body = 'This message was removed when the account was closed.' WHERE sender_user_id = $1`, [row.id]);
      await client.query(`UPDATE conversations SET buyer_display_name = 'Closed account' WHERE buyer_user_id = $1`, [row.id]);
      await client.query(`UPDATE sellers SET display_name = 'Closed shop', storefront_tagline = NULL WHERE user_id = $1`, [row.id]);
      await client.query(`UPDATE listings SET status = 'removed', paused_reason = NULL, updated_at = NOW() WHERE seller_id IN (SELECT id FROM sellers WHERE user_id = $1)`, [row.id]);
      await client.query(`UPDATE support_cases SET contact_name = NULL, contact_email = NULL, contact_phone = NULL WHERE requester_user_id = $1`, [row.id]);
      await client.query(`
        UPDATE users SET email = NULL, phone = NULL, status = 'deleted', deleted_at = NOW(),
          identity_subject = 'closed:' || id::text, deletion_due_at = NULL
        WHERE id = $1
      `, [row.id]);
      await createSystemSupportCase(client, {
        requesterUserId: row.id,
        summary: 'Delete the sign-in account of a closed Katondo account',
        body: row.identity_object_id
          ? `This person's 30-day restore period has ended and Katondo has anonymised their account. Delete their sign-in account in Microsoft Entra: Users, search for object ID ${row.identity_object_id}, then Delete. Resolve this case once done.`
          : `This person's 30-day restore period has ended and Katondo has anonymised their account, but their sign-in object ID wasn't recorded. Check Microsoft Entra for an orphaned sign-in account, then resolve this case.`,
      });
      await client.query(`INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details) VALUES (NULL, 'account.anonymised', 'user', $1, '{}')`, [row.id]);
      await client.query('COMMIT');
      count += 1;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Anonymising a closed account failed', error);
    } finally {
      client.release();
    }
  }
  return count;
}
