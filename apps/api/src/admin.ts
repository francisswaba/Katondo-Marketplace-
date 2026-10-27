import { Router, type NextFunction, type Response } from 'express';
import type { Pool } from 'pg';
import {
  agentPermissions,
  capabilitiesForRoles,
  requireAgentPermission,
  requireAnyRole,
  staffRoles,
  type AuthenticatedRequest,
} from './access.js';
import { recordActivity } from './activity.js';
import { ensurePlatformUser } from './identity.js';
import { readReleaseReadiness, releaseControlKeys, type ReleaseControlKey } from './release.js';
import { getMarketConfiguration } from './market.js';

type Authenticate = (request: AuthenticatedRequest, response: Response, next: NextFunction) => Promise<void>;

const agentPermissionSet = new Set<string>(agentPermissions);

function activitySettings(row: Record<string, unknown>) {
  return {
    collectBuyerActivity: row.collect_buyer_activity === true,
    collectSellerActivity: row.collect_seller_activity === true,
    collectStaffActivity: row.collect_staff_activity === true,
    collectAiAgentActivity: row.collect_ai_agent_activity === true,
    collectSecurityActivity: row.collect_security_activity === true,
    collectTechnicalContext: row.collect_technical_context === true,
    retentionDays: Number(row.retention_days),
    updatedAt: row.updated_at,
  };
}

export function createAdministrationRouter(pool: Pool, authenticate: Authenticate) {
  const router = Router();
  const market = getMarketConfiguration();

  router.get('/api/admin/session', authenticate, requireAnyRole(staffRoles), async (request: AuthenticatedRequest, response) => {
    try {
      const userId = await ensurePlatformUser(pool, request.user!);
      const staffRoleList = request.user!.roles.filter((role) => staffRoles.includes(role));
      await pool.query(`
        INSERT INTO staff_members (user_id, display_name, roles, last_sign_in_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          roles = EXCLUDED.roles,
          status = staff_members.status,
          last_sign_in_at = NOW(),
          updated_at = NOW()
      `, [userId, request.user!.displayName || request.user!.email || 'Katondo staff member', staffRoleList]);
      const staff = await pool.query('SELECT display_name, job_title, status, last_sign_in_at FROM staff_members WHERE user_id = $1', [userId]);
      if (staff.rows[0]?.status !== 'active') {
        response.status(403).json({ error: 'This staff account is not active.' });
        return;
      }
      await recordActivity(pool, request, 'staff', 'staff.session_started');
      response.json({
        staff: { ...staff.rows[0], roles: staffRoleList },
        capabilities: capabilitiesForRoles(request.user!.roles),
      });
    } catch (error) {
      console.error('Staff session failed', error);
      response.status(503).json({ error: 'The staff workspace is temporarily unavailable.' });
    }
  });

  router.get('/api/admin/settings/activity-collection', authenticate, requireAnyRole(['super_administrator']), async (_request, response) => {
    try {
      const result = await pool.query('SELECT * FROM activity_collection_settings WHERE singleton = TRUE');
      response.json({ settings: activitySettings(result.rows[0]) });
    } catch (error) {
      console.error('Activity settings request failed', error);
      response.status(503).json({ error: 'Activity settings are temporarily unavailable.' });
    }
  });

  router.get('/api/admin/staff', authenticate, requireAnyRole(['super_administrator', 'auditor']), async (_request, response) => {
    try {
      const result = await pool.query(`
        SELECT sm.user_id, sm.display_name, sm.job_title, sm.roles, sm.status,
               sm.last_sign_in_at, sm.created_at, u.email, u.phone
        FROM staff_members sm JOIN users u ON u.id = sm.user_id
        ORDER BY sm.status, sm.display_name
      `);
      response.json({ staff: result.rows });
    } catch (error) {
      console.error('Staff directory request failed', error);
      response.status(503).json({ error: 'The staff directory is temporarily unavailable.' });
    }
  });

  router.patch('/api/admin/staff/:userId/status', authenticate, requireAnyRole(['super_administrator']), async (request: AuthenticatedRequest, response) => {
    const status = request.body?.status;
    const userId = Array.isArray(request.params.userId) ? request.params.userId[0] : request.params.userId;
    if (!['active', 'suspended', 'departed'].includes(status)) {
      response.status(400).json({ error: 'Staff status must be active, suspended, or departed.' });
      return;
    }
    try {
      const actorUserId = await ensurePlatformUser(pool, request.user!);
      if (actorUserId === userId) {
        response.status(400).json({ error: 'Use another top administrator to change your own staff status.' });
        return;
      }
      const result = await pool.query(`
        UPDATE staff_members SET status = $2, updated_at = NOW()
        WHERE user_id = $1 RETURNING user_id, display_name, roles, status, last_sign_in_at, updated_at
      `, [userId, status]);
      if (!result.rowCount) {
        response.status(404).json({ error: 'Staff member not found.' });
        return;
      }
      await pool.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
        VALUES ($1, 'staff.status_changed', 'user', $2, $3)
      `, [actorUserId, userId, { status }]);
      await recordActivity(pool, request, 'staff', 'staff.access_status_changed', {
        subjectType: 'user', subjectId: userId, metadata: { status },
      });
      response.json({ staff: result.rows[0] });
    } catch (error) {
      console.error('Staff status update failed', error);
      response.status(503).json({ error: 'The staff status could not be saved.' });
    }
  });

  router.put('/api/admin/settings/activity-collection', authenticate, requireAnyRole(['super_administrator']), async (request: AuthenticatedRequest, response) => {
    const booleanFields = [
      'collectBuyerActivity', 'collectSellerActivity', 'collectStaffActivity',
      'collectAiAgentActivity', 'collectSecurityActivity', 'collectTechnicalContext',
    ] as const;
    if (booleanFields.some((field) => typeof request.body?.[field] !== 'boolean')) {
      response.status(400).json({ error: 'Every activity collection option must be true or false.' });
      return;
    }
    const retentionDays = Number(request.body?.retentionDays);
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
      response.status(400).json({ error: 'Retention must be between 1 and 365 days.' });
      return;
    }
    if (request.body.collectTechnicalContext === true && (!process.env.ACTIVITY_IP_HASH_SECRET || process.env.ACTIVITY_IP_HASH_SECRET.length < 32)) {
      response.status(503).json({ error: 'Configure an activity IP hashing secret of at least 32 characters before collecting technical context.' });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userId = await ensurePlatformUser(client, request.user!);
      const previous = await client.query('SELECT * FROM activity_collection_settings WHERE singleton = TRUE FOR UPDATE');
      const updated = await client.query(`
        UPDATE activity_collection_settings SET
          collect_buyer_activity = $1,
          collect_seller_activity = $2,
          collect_staff_activity = $3,
          collect_ai_agent_activity = $4,
          collect_security_activity = $5,
          collect_technical_context = $6,
          retention_days = $7,
          updated_by_user_id = $8,
          updated_at = NOW()
        WHERE singleton = TRUE
        RETURNING *
      `, [
        request.body.collectBuyerActivity,
        request.body.collectSellerActivity,
        request.body.collectStaffActivity,
        request.body.collectAiAgentActivity,
        request.body.collectSecurityActivity,
        request.body.collectTechnicalContext,
        retentionDays,
        userId,
      ]);
      await client.query(`
        INSERT INTO activity_collection_setting_events (actor_user_id, previous_settings, new_settings)
        VALUES ($1, $2, $3)
      `, [userId, activitySettings(previous.rows[0]), activitySettings(updated.rows[0])]);
      await client.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, details)
        VALUES ($1, 'activity_collection.settings_changed', 'activity_collection_settings', $2)
      `, [userId, activitySettings(updated.rows[0])]);
      await client.query('COMMIT');
      response.json({ settings: activitySettings(updated.rows[0]) });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Activity settings update failed', error);
      response.status(503).json({ error: 'Activity settings could not be saved.' });
    } finally {
      client.release();
    }
  });

  router.get('/api/admin/activity', authenticate, requireAnyRole(['super_administrator', 'auditor']), async (request, response) => {
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 100);
    const category = typeof request.query.category === 'string' ? request.query.category : null;
    try {
      const result = await pool.query(`
        SELECT id, actor_user_id, actor_type, actor_client_id, actor_roles, category,
               event_name, subject_type, subject_id, route, request_id, ip_hash,
               user_agent, metadata, created_at
        FROM activity_events
        WHERE ($1::text IS NULL OR category = $1)
        ORDER BY created_at DESC
        LIMIT $2
      `, [category, limit]);
      response.json({ events: result.rows });
    } catch (error) {
      console.error('Activity event request failed', error);
      response.status(503).json({ error: 'Activity events are temporarily unavailable.' });
    }
  });

  router.get('/api/admin/release-controls', authenticate, requireAnyRole(['super_administrator', 'auditor']), async (_request, response) => {
    try {
      response.json(await readReleaseReadiness(pool));
    } catch (error) {
      console.error('Release controls request failed', error);
      response.status(503).json({ error: 'Release controls are temporarily unavailable.' });
    }
  });

  router.put('/api/admin/release-controls/:controlKey', authenticate, requireAnyRole(['super_administrator']), async (request: AuthenticatedRequest, response) => {
    const controlKey = (Array.isArray(request.params.controlKey) ? request.params.controlKey[0] : request.params.controlKey) as ReleaseControlKey;
    const status = request.body?.status;
    const approverAuthority = typeof request.body?.approverAuthority === 'string' ? request.body.approverAuthority.trim() : '';
    const evidenceReference = typeof request.body?.evidenceReference === 'string' ? request.body.evidenceReference.trim() : '';
    const notes = typeof request.body?.notes === 'string' ? request.body.notes.trim() : '';
    const expiresAt = request.body?.expiresAt ? new Date(request.body.expiresAt) : null;
    if (!releaseControlKeys.includes(controlKey) || !['pending', 'approved', 'revoked'].includes(status)) {
      response.status(400).json({ error: 'Provide a valid release control and status.' });
      return;
    }
    if (status === 'approved' && (approverAuthority.length < 3 || evidenceReference.length < 5)) {
      response.status(400).json({ error: 'Approved controls require the approving authority and an evidence reference.' });
      return;
    }
    if (status === 'approved' && expiresAt && expiresAt <= new Date()) {
      response.status(400).json({ error: 'An approval expiry date must be in the future.' });
      return;
    }
    if (approverAuthority.length > 200 || evidenceReference.length > 500 || notes.length > 1000 || (expiresAt && Number.isNaN(expiresAt.getTime()))) {
      response.status(400).json({ error: 'Release-control evidence is invalid or too long.' });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const actorUserId = await ensurePlatformUser(client, request.user!);
      const previous = await client.query('SELECT status FROM release_controls WHERE country_code = $1 AND control_key = $2 FOR UPDATE', [market.countryCode, controlKey]);
      if (!previous.rowCount) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Release control not found.' });
        return;
      }
      await client.query(`
        UPDATE release_controls SET
          status = $3,
          approver_authority = CASE WHEN $3 = 'approved' THEN $4 ELSE NULL END,
          evidence_reference = CASE WHEN $3 = 'approved' THEN $5 ELSE NULL END,
          notes = NULLIF($6, ''),
          approved_by_user_id = CASE WHEN $3 = 'approved' THEN $7 ELSE NULL END,
          approved_at = CASE WHEN $3 = 'approved' THEN NOW() ELSE NULL END,
          expires_at = CASE WHEN $3 = 'approved' THEN $8 ELSE NULL END,
          updated_at = NOW()
        WHERE country_code = $1 AND control_key = $2
      `, [market.countryCode, controlKey, status, approverAuthority, evidenceReference, notes, actorUserId, expiresAt?.toISOString() ?? null]);
      await client.query(`
        INSERT INTO release_control_events (
          country_code, control_key, previous_status, new_status, actor_user_id,
          approver_authority, evidence_reference, notes
        ) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''))
      `, [market.countryCode, controlKey, previous.rows[0].status, status, actorUserId, approverAuthority, evidenceReference, notes]);
      await client.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, details)
        VALUES ($1, 'release_control.status_changed', 'release_control', $2)
      `, [actorUserId, { countryCode: market.countryCode, controlKey, previousStatus: previous.rows[0].status, status, evidenceReference }]);
      await client.query('COMMIT');
      await recordActivity(pool, request, 'staff', 'staff.release_control_changed', {
        subjectType: 'release_control', subjectId: controlKey, metadata: { status },
      });
      response.json(await readReleaseReadiness(pool));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Release control update failed', error);
      response.status(503).json({ error: 'The release control could not be saved.' });
    } finally {
      client.release();
    }
  });

  router.get('/api/admin/agents', authenticate, requireAnyRole(['super_administrator', 'auditor']), async (_request, response) => {
    try {
      const result = await pool.query(`
        SELECT id, client_id, name, description, status, permissions, last_seen_at, created_at, updated_at
        FROM service_agents ORDER BY name
      `);
      response.json({ agents: result.rows });
    } catch (error) {
      console.error('Agent registry request failed', error);
      response.status(503).json({ error: 'The agent registry is temporarily unavailable.' });
    }
  });

  router.post('/api/admin/agents', authenticate, requireAnyRole(['super_administrator']), async (request: AuthenticatedRequest, response) => {
    const clientId = typeof request.body?.clientId === 'string' ? request.body.clientId.trim() : '';
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    const description = typeof request.body?.description === 'string' ? request.body.description.trim() : '';
    const permissions = Array.isArray(request.body?.permissions)
      ? request.body.permissions.filter((permission: unknown): permission is string => typeof permission === 'string' && agentPermissionSet.has(permission))
      : [];
    if (clientId.length < 3 || clientId.length > 200 || name.length < 2 || name.length > 120 || permissions.length === 0 || permissions.length !== request.body.permissions.length) {
      response.status(400).json({ error: 'Provide a valid identity-provider client ID, name, and approved permissions.' });
      return;
    }
    try {
      const userId = await ensurePlatformUser(pool, request.user!);
      const result = await pool.query(`
        INSERT INTO service_agents (client_id, name, description, permissions, created_by_user_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, client_id, name, description, status, permissions, created_at
      `, [clientId, name, description || null, permissions, userId]);
      await pool.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
        VALUES ($1, 'service_agent.registered', 'service_agent', $2, $3)
      `, [userId, result.rows[0].id, { clientId, name, permissions }]);
      response.status(201).json({ agent: result.rows[0] });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({ error: 'That identity-provider client ID is already registered.' });
        return;
      }
      console.error('Agent registration failed', error);
      response.status(503).json({ error: 'The agent could not be registered.' });
    }
  });

  router.patch('/api/admin/agents/:agentId/status', authenticate, requireAnyRole(['super_administrator']), async (request: AuthenticatedRequest, response) => {
    const status = request.body?.status;
    if (!['active', 'disabled'].includes(status)) {
      response.status(400).json({ error: 'Agent status must be active or disabled.' });
      return;
    }
    try {
      const userId = await ensurePlatformUser(pool, request.user!);
      const result = await pool.query(`
        UPDATE service_agents SET status = $2, updated_at = NOW()
        WHERE id = $1 RETURNING id, client_id, name, status, permissions, updated_at
      `, [request.params.agentId, status]);
      if (!result.rowCount) {
        response.status(404).json({ error: 'Service agent not found.' });
        return;
      }
      await pool.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
        VALUES ($1, 'service_agent.status_changed', 'service_agent', $2, $3)
      `, [userId, request.params.agentId, { status }]);
      response.json({ agent: result.rows[0] });
    } catch (error) {
      console.error('Agent status update failed', error);
      response.status(503).json({ error: 'The agent status could not be saved.' });
    }
  });

  router.get('/api/agent/session', authenticate, requireAnyRole(['service_agent']), (request: AuthenticatedRequest, response) => {
    response.json({
      agent: { id: request.user?.agentId, clientId: request.user?.clientId },
      permissions: request.user?.permissions ?? [],
    });
  });

  router.get('/api/agent/catalogue', authenticate, requireAgentPermission('catalogue:read'), async (request: AuthenticatedRequest, response) => {
    try {
      const [categories, listings] = await Promise.all([
        pool.query('SELECT id, name, slug FROM categories ORDER BY name'),
        pool.query(`
          SELECT id, title, price_minor, currency, condition, category_id, seller_id, seller_name, quantity
          FROM listings WHERE country_code = $1 ORDER BY created_at DESC LIMIT 500
        `, [market.countryCode]),
      ]);
      await recordActivity(pool, request, 'ai_agent', 'agent.catalogue_read', {
        metadata: { categoryCount: categories.rowCount, listingCount: listings.rowCount },
      });
      response.json({ categories: categories.rows, listings: listings.rows });
    } catch (error) {
      console.error('Agent catalogue request failed', error);
      response.status(503).json({ error: 'The catalogue is temporarily unavailable.' });
    }
  });

  router.get('/api/agent/seller-applications', authenticate, requireAgentPermission('seller_applications:read'), async (request: AuthenticatedRequest, response) => {
    try {
      const result = await pool.query(`
        SELECT s.id, s.seller_type, s.display_name, s.verification_status, a.city, a.country_code, a.accepted_at
        FROM sellers s JOIN seller_applications a ON a.seller_id = s.id
        WHERE s.verification_status IN ('pending', 'in_review') AND a.country_code = $1
        ORDER BY a.accepted_at ASC LIMIT 100
      `, [market.countryCode]);
      await recordActivity(pool, request, 'ai_agent', 'agent.seller_applications_read', { metadata: { count: result.rowCount } });
      response.json({ applications: result.rows });
    } catch (error) {
      console.error('Agent seller queue failed', error);
      response.status(503).json({ error: 'The seller queue is temporarily unavailable.' });
    }
  });

  router.post('/api/agent/seller-applications/:sellerId/triage', authenticate, requireAgentPermission('seller_applications:triage'), async (request: AuthenticatedRequest, response) => {
    const sellerId = Array.isArray(request.params.sellerId) ? request.params.sellerId[0] : request.params.sellerId;
    const recommendation = request.body?.recommendation;
    const summary = typeof request.body?.summary === 'string' ? request.body.summary.trim() : '';
    const details = request.body?.details && typeof request.body.details === 'object' && !Array.isArray(request.body.details)
      ? request.body.details
      : {};
    if (!['potentially_clear', 'needs_human_review', 'risk_flag'].includes(recommendation) || summary.length < 3 || summary.length > 500 || JSON.stringify(details).length > 4096) {
      response.status(400).json({ error: 'Provide a valid recommendation, a short summary, and limited structured details.' });
      return;
    }
    try {
      const result = await pool.query(`
        INSERT INTO agent_triage_recommendations (agent_id, seller_id, recommendation, summary, details)
        SELECT $1, $2, $3, $4, $5
        WHERE EXISTS (
          SELECT 1 FROM seller_applications
          WHERE seller_id = $2 AND country_code = $6
        )
        RETURNING id, seller_id, recommendation, summary, created_at
      `, [request.user!.agentId, sellerId, recommendation, summary, details, market.countryCode]);
      if (!result.rowCount) {
        response.status(404).json({ error: 'Seller application not found.' });
        return;
      }
      await recordActivity(pool, request, 'ai_agent', 'agent.seller_application_triaged', {
        subjectType: 'seller', subjectId: sellerId, metadata: { recommendation },
      });
      response.status(201).json({ triage: result.rows[0], requiresHumanDecision: true });
    } catch (error) {
      if ((error as { code?: string }).code === '23503') {
        response.status(404).json({ error: 'Seller application not found.' });
        return;
      }
      console.error('Agent triage failed', error);
      response.status(503).json({ error: 'The triage recommendation could not be saved.' });
    }
  });

  return router;
}
