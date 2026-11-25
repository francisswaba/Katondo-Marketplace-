import { Router, type NextFunction, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import {
  messageMaxLength,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationRole,
  type ConversationSummary,
  type FeatureFlags,
  type MessageFlag,
} from '@katondo/contracts';
import { requireAnyRole, type AuthenticatedRequest } from './access.js';
import { recordActivity } from './activity.js';
import { ensurePlatformUser, findPlatformUserId } from './identity.js';
import { getMarketConfiguration } from './market.js';
import { cleanReviewText, reviewsEnabled } from './reviews.js';
import { supportEnabled } from './support.js';

type Authenticate = (request: AuthenticatedRequest, response: Response, next: NextFunction) => Promise<void>;

/** Messaging stays off until sign-in is live. Never switch on to "test" in production. */
export const messagingEnabled = () => process.env.MESSAGING_ENABLED === 'true';

export const messageReportRoles = ['super_administrator', 'administrator', 'customer_support'] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sendLimit = { count: 30, minutes: 10 };
const newConversationLimit = { count: 20, hours: 24 };
const reportReasons = ['scam', 'abuse', 'spam', 'other'] as const;

/**
 * Spots content that usually comes before a marketplace scam: taking the conversation
 * or the payment off the platform. Messages are still delivered; the recipient sees a warning.
 */
export function detectMessageFlags(body: string): MessageFlag[] {
  const flags = new Set<MessageFlag>();
  const digits = body.replace(/[\s().-]/g, '');
  if (/(?:\+?260|0)[79]\d{8}/.test(digits) || /\d{9,}/.test(digits) || /whats\s?app/i.test(body)) flags.add('phone_number');
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(body)) flags.add('email');
  if (/\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|zm|io|me|ly|link|shop|co)(\/|\b)/i.test(body)) flags.add('link');
  if (/\b(airtel\s?money|mtn\s?(mo\s?mo|money)|momo|zamtel\s?kwacha|mobile\s?money|send\s+(the\s+)?money|bank\s+transfer|deposit|western\s+union|moneygram|pay\s+(me\s+)?(directly|outside|upfront|up\s+front|first|cash\s+first|before))\b/i.test(body)) {
    flags.add('off_platform_payment');
  }
  return [...flags];
}

export function cleanMessage(value: unknown) {
  return cleanReviewText(value);
}

type Participant = {
  conversation: Record<string, any>;
  role: ConversationRole;
  userId: string;
  counterpartUserId: string;
};

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function createMessagingRouter(pool: Pool, authenticate: Authenticate) {
  const router = Router();
  const market = getMarketConfiguration();

  function requireMessaging(_request: AuthenticatedRequest, response: Response, next: NextFunction) {
    if (!messagingEnabled()) {
      response.status(503).json({ error: 'Messaging opens once sign-in is switched on.' });
      return;
    }
    next();
  }

  async function participant(database: Pool | PoolClient, conversationId: string, userId: string): Promise<Participant | null> {
    const result = await database.query(`
      SELECT c.*, s.display_name AS seller_name, s.user_id AS seller_user_id
      FROM conversations c JOIN sellers s ON s.id = c.seller_id
      WHERE c.id = $1 AND (c.buyer_user_id = $2 OR s.user_id = $2)
    `, [conversationId, userId]);
    const conversation = result.rows[0];
    if (!conversation) return null;
    const role: ConversationRole = conversation.buyer_user_id === userId ? 'buyer' : 'seller';
    return {
      conversation,
      role,
      userId,
      counterpartUserId: role === 'buyer' ? conversation.seller_user_id : conversation.buyer_user_id,
    };
  }

  async function blockState(database: Pool | PoolClient, userId: string, otherUserId: string) {
    const result = await database.query(`
      SELECT blocker_user_id FROM user_blocks
      WHERE (blocker_user_id = $1 AND blocked_user_id = $2) OR (blocker_user_id = $2 AND blocked_user_id = $1)
    `, [userId, otherUserId]);
    return {
      closed: result.rowCount! > 0,
      blockedByMe: result.rows.some((row) => row.blocker_user_id === userId),
    };
  }

  async function overSendLimit(database: Pool | PoolClient, userId: string) {
    const result = await database.query(
      `SELECT COUNT(*) AS count FROM messages WHERE sender_user_id = $1 AND created_at > NOW() - make_interval(mins => $2)`,
      [userId, sendLimit.minutes],
    );
    return Number(result.rows[0].count) >= sendLimit.count;
  }

  /** Adds a message and moves the conversation to the top of both inboxes. */
  async function addMessage(client: PoolClient, conversationId: string, role: ConversationRole, userId: string, body: string) {
    const flags = detectMessageFlags(body);
    const inserted = await client.query(`
      INSERT INTO messages (conversation_id, sender_role, sender_user_id, body, flags)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at
    `, [conversationId, role, userId, body, flags]);
    await client.query(`
      UPDATE conversations SET last_message_at = NOW(),
        ${role === 'buyer' ? 'buyer_last_read_at' : 'seller_last_read_at'} = NOW()
      WHERE id = $1
    `, [conversationId]);
    return { id: inserted.rows[0].id as string, flags };
  }

  function validBody(value: unknown) {
    const body = cleanMessage(value);
    if (!body) return { error: 'Write a message first.' };
    if (body.length > messageMaxLength) return { error: `Keep messages to ${messageMaxLength.toLocaleString('en')} characters or fewer.` };
    return { body };
  }

  // Public: which optional features are switched on, so apps can show or hide them.
  router.get('/api/features', (_request, response) => {
    const payload: FeatureFlags = { reviews: reviewsEnabled(), messaging: messagingEnabled(), support: supportEnabled() };
    response.json(payload);
  });

  // Buyer: message a seller about a listing. Reuses the existing conversation for that listing.
  router.post('/api/listings/:listingId/messages', authenticate, requireMessaging, async (request: AuthenticatedRequest, response) => {
    const listingId = String(request.params.listingId);
    const parsed = validBody(request.body?.body);
    if (!uuidPattern.test(listingId)) {
      response.status(404).json({ error: 'Listing not found.' });
      return;
    }
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const client = await pool.connect();
    try {
      const userId = await ensurePlatformUser(client, request.user!);
      const listing = await client.query(`
        SELECT l.id, l.title, l.seller_id, s.user_id AS seller_user_id
        FROM listings l JOIN sellers s ON s.id = l.seller_id
        WHERE l.id = $1 AND l.status = 'published' AND l.country_code = $2
          AND (s.verification_status = 'verified' OR s.seller_type = 'platform')
      `, [listingId, market.countryCode]);
      const item = listing.rows[0];
      if (!item) {
        response.status(404).json({ error: 'This listing isn’t available to message about.' });
        return;
      }
      if (item.seller_user_id === userId) {
        response.status(400).json({ error: 'This is your own listing.' });
        return;
      }
      if ((await blockState(client, userId, item.seller_user_id)).closed) {
        response.status(403).json({ error: 'You can’t message this seller.' });
        return;
      }
      if (await overSendLimit(client, userId)) {
        response.status(429).json({ error: 'You’re sending messages too quickly. Wait a few minutes and try again.' });
        return;
      }
      const existing = await client.query('SELECT id FROM conversations WHERE listing_id = $1 AND buyer_user_id = $2', [listingId, userId]);
      if (!existing.rows[0]) {
        const recent = await client.query(
          `SELECT COUNT(*) AS count FROM conversations WHERE buyer_user_id = $1 AND created_at > NOW() - make_interval(hours => $2)`,
          [userId, newConversationLimit.hours],
        );
        if (Number(recent.rows[0].count) >= newConversationLimit.count) {
          response.status(429).json({ error: 'You’ve started a lot of conversations today. Try again tomorrow.' });
          return;
        }
      }
      const buyerName = (request.user!.displayName || '').trim().split(/\s+/)[0]?.slice(0, 40) || 'Buyer';
      await client.query('BEGIN');
      const conversation = await client.query(`
        INSERT INTO conversations (listing_id, listing_title, buyer_user_id, buyer_display_name, seller_id)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (listing_id, buyer_user_id) WHERE listing_id IS NOT NULL
        DO UPDATE SET listing_title = EXCLUDED.listing_title
        RETURNING id
      `, [listingId, item.title, userId, buyerName, item.seller_id]);
      const conversationId = conversation.rows[0].id as string;
      const message = await addMessage(client, conversationId, 'buyer', userId, parsed.body);
      await client.query('COMMIT');
      // Never record message content in the activity ledger.
      await recordActivity(pool, request, 'buyer', 'buyer.message_sent', { subjectType: 'conversation', subjectId: conversationId, metadata: { flags: message.flags } });
      response.status(201).json({ conversationId, message: { id: message.id } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((error as Error).message?.includes('verified email')) {
        response.status(403).json({ error: 'Verify your email address or phone number before messaging sellers.' });
        return;
      }
      console.error('Start conversation failed', error);
      response.status(503).json({ error: 'Your message could not be sent. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  // Buyer or seller: inbox, newest first.
  router.get('/api/conversations', authenticate, requireMessaging, async (request: AuthenticatedRequest, response) => {
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      if (!userId) {
        response.json({ conversations: [] });
        return;
      }
      const result = await pool.query(`
        SELECT c.id, c.listing_id, c.listing_title, c.last_message_at, c.buyer_display_name,
          s.display_name AS seller_name,
          CASE WHEN c.buyer_user_id = $1 THEN 'buyer' ELSE 'seller' END AS role,
          last.body AS last_body, last.status AS last_status,
          (SELECT COUNT(*) FROM messages m
            WHERE m.conversation_id = c.id AND m.status = 'visible'
              AND m.sender_role <> CASE WHEN c.buyer_user_id = $1 THEN 'buyer' ELSE 'seller' END
              AND m.created_at > COALESCE(CASE WHEN c.buyer_user_id = $1 THEN c.buyer_last_read_at ELSE c.seller_last_read_at END, '-infinity')
          ) AS unread
        FROM conversations c
        JOIN sellers s ON s.id = c.seller_id
        LEFT JOIN LATERAL (
          SELECT body, status FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
        ) last ON TRUE
        WHERE c.buyer_user_id = $1 OR s.user_id = $1
        ORDER BY c.last_message_at DESC
        LIMIT 100
      `, [userId]);
      const conversations: ConversationSummary[] = result.rows.map((row) => ({
        id: row.id,
        role: row.role,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        counterpartName: row.role === 'buyer' ? row.seller_name : row.buyer_display_name,
        lastMessage: row.last_status === 'removed' ? 'Message removed by Katondo' : row.last_body ?? null,
        lastMessageAt: iso(row.last_message_at),
        unread: Number(row.unread),
      }));
      response.json({ conversations });
    } catch (error) {
      console.error('Inbox request failed', error);
      response.status(503).json({ error: 'Your messages are temporarily unavailable.' });
    }
  });

  // Buyer or seller: unread count for the header badge.
  router.get('/api/messages/unread', authenticate, requireMessaging, async (request: AuthenticatedRequest, response) => {
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      if (!userId) {
        response.json({ unread: 0 });
        return;
      }
      const result = await pool.query(`
        SELECT COUNT(*) AS unread
        FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN sellers s ON s.id = c.seller_id
        WHERE m.status = 'visible' AND (
          (c.buyer_user_id = $1 AND m.sender_role = 'seller' AND m.created_at > COALESCE(c.buyer_last_read_at, '-infinity')) OR
          (s.user_id = $1 AND m.sender_role = 'buyer' AND m.created_at > COALESCE(c.seller_last_read_at, '-infinity'))
        )
      `, [userId]);
      response.json({ unread: Number(result.rows[0].unread) });
    } catch (error) {
      console.error('Unread count failed', error);
      response.status(503).json({ error: 'Your messages are temporarily unavailable.' });
    }
  });

  // Buyer or seller: one conversation. Opening it marks it read.
  router.get('/api/conversations/:conversationId', authenticate, requireMessaging, async (request: AuthenticatedRequest, response) => {
    const conversationId = String(request.params.conversationId);
    if (!uuidPattern.test(conversationId)) {
      response.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      const found = userId ? await participant(pool, conversationId, userId) : null;
      if (!found) {
        response.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      const { conversation, role } = found;
      const [messages, blocks] = await Promise.all([
        pool.query(`
          SELECT * FROM (
            SELECT id, sender_role, body, flags, status, created_at FROM messages
            WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 200
          ) recent ORDER BY created_at ASC
        `, [conversationId]),
        blockState(pool, userId!, found.counterpartUserId),
        pool.query(`UPDATE conversations SET ${role === 'buyer' ? 'buyer_last_read_at' : 'seller_last_read_at'} = NOW() WHERE id = $1`, [conversationId]),
      ]);
      const items: ConversationMessage[] = messages.rows.map((row) => {
        const mine = row.sender_role === role;
        const removed = row.status === 'removed';
        return {
          id: row.id,
          mine,
          body: removed ? null : row.body,
          removed,
          // Warnings are for the person receiving the message.
          flags: mine || removed ? [] : row.flags,
          createdAt: iso(row.created_at),
        };
      });
      const payload: ConversationDetail = {
        id: conversation.id,
        role,
        listingId: conversation.listing_id,
        listingTitle: conversation.listing_title,
        counterpartName: role === 'buyer' ? conversation.seller_name : conversation.buyer_display_name,
        lastMessage: null,
        lastMessageAt: iso(conversation.last_message_at),
        unread: 0,
        messages: items,
        closed: blocks.closed,
        blockedByMe: blocks.blockedByMe,
      };
      response.json(payload);
    } catch (error) {
      console.error('Conversation request failed', error);
      response.status(503).json({ error: 'This conversation is temporarily unavailable.' });
    }
  });

  // Buyer or seller: reply in a conversation.
  router.post('/api/conversations/:conversationId/messages', authenticate, requireMessaging, async (request: AuthenticatedRequest, response) => {
    const conversationId = String(request.params.conversationId);
    const parsed = validBody(request.body?.body);
    if (!uuidPattern.test(conversationId)) {
      response.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    const client = await pool.connect();
    try {
      const userId = await findPlatformUserId(client, request.user!);
      const found = userId ? await participant(client, conversationId, userId) : null;
      if (!found) {
        response.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      if ((await blockState(client, found.userId, found.counterpartUserId)).closed) {
        response.status(403).json({ error: 'This conversation is closed.' });
        return;
      }
      if (await overSendLimit(client, found.userId)) {
        response.status(429).json({ error: 'You’re sending messages too quickly. Wait a few minutes and try again.' });
        return;
      }
      await client.query('BEGIN');
      const message = await addMessage(client, conversationId, found.role, found.userId, parsed.body);
      await client.query('COMMIT');
      await recordActivity(pool, request, found.role === 'buyer' ? 'buyer' : 'seller', `${found.role}.message_sent`, {
        subjectType: 'conversation', subjectId: conversationId, metadata: { flags: message.flags },
      });
      response.status(201).json({ message: { id: message.id } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Send message failed', error);
      response.status(503).json({ error: 'Your message could not be sent. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  // Buyer or seller: report a conversation to Katondo staff.
  router.post('/api/conversations/:conversationId/report', authenticate, requireMessaging, async (request: AuthenticatedRequest, response) => {
    const conversationId = String(request.params.conversationId);
    const reason = request.body?.reason;
    const details = cleanMessage(request.body?.details);
    if (!uuidPattern.test(conversationId)) {
      response.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    if (!reportReasons.includes(reason)) {
      response.status(400).json({ error: 'Choose why you’re reporting this conversation.' });
      return;
    }
    if (details.length > 1000) {
      response.status(400).json({ error: 'Keep the details to 1,000 characters or fewer.' });
      return;
    }
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      const found = userId ? await participant(pool, conversationId, userId) : null;
      if (!found) {
        response.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      const open = await pool.query(
        `SELECT 1 FROM conversation_reports WHERE conversation_id = $1 AND reporter_user_id = $2 AND status = 'open'`,
        [conversationId, found.userId],
      );
      if (open.rowCount) {
        response.status(409).json({ error: 'You’ve already reported this conversation. Our team will look at it.' });
        return;
      }
      const result = await pool.query(`
        INSERT INTO conversation_reports (conversation_id, reporter_user_id, reason, details)
        VALUES ($1, $2, $3, $4) RETURNING id
      `, [conversationId, found.userId, reason, details || null]);
      await recordActivity(pool, request, found.role === 'buyer' ? 'buyer' : 'seller', 'conversation.reported', {
        subjectType: 'conversation', subjectId: conversationId, metadata: { reason },
      });
      response.status(201).json({ report: { id: result.rows[0].id } });
    } catch (error) {
      console.error('Report conversation failed', error);
      response.status(503).json({ error: 'Your report could not be sent. Try again in a moment.' });
    }
  });

  // Buyer or seller: block or unblock the other person. Blocking closes every conversation between them.
  for (const method of ['post', 'delete'] as const) {
    router[method]('/api/conversations/:conversationId/block', authenticate, requireMessaging, async (request: AuthenticatedRequest, response) => {
      const conversationId = String(request.params.conversationId);
      if (!uuidPattern.test(conversationId)) {
        response.status(404).json({ error: 'Conversation not found.' });
        return;
      }
      try {
        const userId = await findPlatformUserId(pool, request.user!);
        const found = userId ? await participant(pool, conversationId, userId) : null;
        if (!found) {
          response.status(404).json({ error: 'Conversation not found.' });
          return;
        }
        if (method === 'post') {
          await pool.query(
            'INSERT INTO user_blocks (blocker_user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [found.userId, found.counterpartUserId],
          );
        } else {
          await pool.query('DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2', [found.userId, found.counterpartUserId]);
        }
        await recordActivity(pool, request, found.role === 'buyer' ? 'buyer' : 'seller', method === 'post' ? 'conversation.blocked' : 'conversation.unblocked', {
          subjectType: 'conversation', subjectId: conversationId,
        });
        response.json({ blocked: method === 'post' });
      } catch (error) {
        console.error('Block change failed', error);
        response.status(503).json({ error: 'That change could not be saved. Try again in a moment.' });
      }
    });
  }

  // Staff: reported conversations. The list shows no message content.
  router.get('/api/admin/conversation-reports', authenticate, requireAnyRole([...messageReportRoles]), async (request: AuthenticatedRequest, response) => {
    const status = request.query.status === 'resolved' ? 'resolved' : 'open';
    try {
      const result = await pool.query(`
        SELECT r.id, r.conversation_id, r.reason, r.details, r.status, r.resolution_note, r.created_at, r.resolved_at,
          CASE WHEN r.reporter_user_id = c.buyer_user_id THEN 'buyer' ELSE 'seller' END AS reported_by,
          c.listing_title, s.display_name AS seller_name, c.buyer_display_name
        FROM conversation_reports r
        JOIN conversations c ON c.id = r.conversation_id
        JOIN sellers s ON s.id = c.seller_id
        WHERE r.status = $1
        ORDER BY r.created_at DESC LIMIT 100
      `, [status]);
      response.json({ enabled: messagingEnabled(), reports: result.rows });
    } catch (error) {
      console.error('Conversation reports request failed', error);
      response.status(503).json({ error: 'Reports are temporarily unavailable.' });
    }
  });

  // Staff: open a reported conversation. Reading private messages is always written to the audit history.
  router.get('/api/admin/conversation-reports/:reportId', authenticate, requireAnyRole([...messageReportRoles]), async (request: AuthenticatedRequest, response) => {
    const reportId = String(request.params.reportId);
    if (!uuidPattern.test(reportId)) {
      response.status(404).json({ error: 'Report not found.' });
      return;
    }
    try {
      const report = await pool.query('SELECT conversation_id FROM conversation_reports WHERE id = $1', [reportId]);
      if (!report.rows[0]) {
        response.status(404).json({ error: 'Report not found.' });
        return;
      }
      const conversationId = report.rows[0].conversation_id;
      const staffUserId = await ensurePlatformUser(pool, request.user!);
      await pool.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
        VALUES ($1, 'conversation.viewed_by_staff', 'conversation', $2, $3)
      `, [staffUserId, conversationId, JSON.stringify({ reportId })]);
      const messages = await pool.query(`
        SELECT id, sender_role, body, flags, status, removed_reason, created_at
        FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 500
      `, [conversationId]);
      response.json({ conversationId, messages: messages.rows });
    } catch (error) {
      console.error('Reported conversation request failed', error);
      response.status(503).json({ error: 'This conversation is temporarily unavailable.' });
    }
  });

  // Staff: close a report with a note.
  router.post('/api/admin/conversation-reports/:reportId/resolve', authenticate, requireAnyRole([...messageReportRoles]), async (request: AuthenticatedRequest, response) => {
    const reportId = String(request.params.reportId);
    const note = cleanMessage(request.body?.note);
    if (!uuidPattern.test(reportId)) {
      response.status(404).json({ error: 'Report not found.' });
      return;
    }
    if (note.length < 3 || note.length > 500) {
      response.status(400).json({ error: 'Add a note between 3 and 500 characters.' });
      return;
    }
    try {
      const staffUserId = await ensurePlatformUser(pool, request.user!);
      const result = await pool.query(`
        UPDATE conversation_reports SET status = 'resolved', resolution_note = $1, resolved_by_user_id = $2, resolved_at = NOW()
        WHERE id = $3 AND status = 'open' RETURNING conversation_id
      `, [note, staffUserId, reportId]);
      if (!result.rowCount) {
        response.status(409).json({ error: 'This report is already resolved.' });
        return;
      }
      await pool.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
        VALUES ($1, 'conversation_report.resolved', 'conversation_report', $2, $3)
      `, [staffUserId, reportId, JSON.stringify({ note })]);
      response.json({ report: { id: reportId, status: 'resolved' } });
    } catch (error) {
      console.error('Resolve report failed', error);
      response.status(503).json({ error: 'The report could not be updated. Try again in a moment.' });
    }
  });

  // Staff: remove a message from a reported conversation.
  router.post('/api/admin/messages/:messageId/remove', authenticate, requireAnyRole([...messageReportRoles]), async (request: AuthenticatedRequest, response) => {
    const messageId = String(request.params.messageId);
    const reason = cleanMessage(request.body?.reason);
    if (!uuidPattern.test(messageId)) {
      response.status(404).json({ error: 'Message not found.' });
      return;
    }
    if (reason.length < 3 || reason.length > 500) {
      response.status(400).json({ error: 'Add a reason between 3 and 500 characters.' });
      return;
    }
    try {
      const staffUserId = await ensurePlatformUser(pool, request.user!);
      const result = await pool.query(`
        UPDATE messages m SET status = 'removed', removed_reason = $1, removed_by_user_id = $2, removed_at = NOW()
        WHERE m.id = $3 AND m.status = 'visible'
          AND EXISTS (SELECT 1 FROM conversation_reports r WHERE r.conversation_id = m.conversation_id)
        RETURNING m.id
      `, [reason, staffUserId, messageId]);
      if (!result.rowCount) {
        response.status(409).json({ error: 'Only visible messages in reported conversations can be removed.' });
        return;
      }
      await pool.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
        VALUES ($1, 'message.removed', 'message', $2, $3)
      `, [staffUserId, messageId, JSON.stringify({ reason })]);
      response.json({ message: { id: messageId, status: 'removed' } });
    } catch (error) {
      console.error('Remove message failed', error);
      response.status(503).json({ error: 'The message could not be removed. Try again in a moment.' });
    }
  });

  return router;
}
