import { createHmac, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthenticatedRequest } from './access.js';

export type ActivityCategory = 'buyer' | 'seller' | 'staff' | 'ai_agent' | 'security';

type ActivityDetails = {
  subjectType?: string;
  subjectId?: string;
  metadata?: Record<string, unknown>;
};

const categorySetting: Record<ActivityCategory, string> = {
  buyer: 'collect_buyer_activity',
  seller: 'collect_seller_activity',
  staff: 'collect_staff_activity',
  ai_agent: 'collect_ai_agent_activity',
  security: 'collect_security_activity',
};

function limitMetadata(metadata: Record<string, unknown> = {}) {
  const serialised = JSON.stringify(metadata);
  if (serialised.length > 4096) return { truncated: true };
  return metadata;
}

function requestIp(request: AuthenticatedRequest) {
  const forwarded = request.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.socket.remoteAddress || '';
}

export async function recordActivity(
  pool: Pool,
  request: AuthenticatedRequest,
  category: ActivityCategory,
  eventName: string,
  details: ActivityDetails = {},
) {
  try {
    const settings = await pool.query('SELECT * FROM activity_collection_settings WHERE singleton = TRUE');
    const current = settings.rows[0];
    if (!current?.[categorySetting[category]]) return;

    const principal = request.user;
    const technicalContext = current.collect_technical_context === true;
    const secret = process.env.ACTIVITY_IP_HASH_SECRET;
    const ipHash = technicalContext && secret
      ? createHmac('sha256', secret).update(requestIp(request)).digest('hex')
      : null;
    const actorType = principal?.actorType
      ?? (category === 'buyer' || category === 'seller' ? category : 'system');

    await pool.query(`
      INSERT INTO activity_events (
        actor_user_id, actor_type, actor_client_id, actor_roles, category, event_name,
        subject_type, subject_id, route, request_id, ip_hash, user_agent, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      principal?.platformUserId ?? null,
      actorType,
      principal?.clientId ?? null,
      principal?.roles ?? [],
      category,
      eventName,
      details.subjectType ?? null,
      details.subjectId ?? null,
      request.path,
      randomUUID(),
      ipHash,
      technicalContext ? request.header('user-agent')?.slice(0, 500) ?? null : null,
      limitMetadata(details.metadata),
    ]);
  } catch (error) {
    console.error('Activity recording failed', error);
  }
}

export function scheduleActivityRetention(pool: Pool) {
  const removeExpired = async () => {
    try {
      await pool.query(`
        DELETE FROM activity_events
        WHERE created_at < NOW() - (
          SELECT make_interval(days => retention_days)
          FROM activity_collection_settings WHERE singleton = TRUE
        )
      `);
    } catch (error) {
      console.error('Activity retention cleanup failed', error);
    }
  };

  void removeExpired();
  const timer = setInterval(removeExpired, 24 * 60 * 60 * 1000);
  timer.unref();
}
