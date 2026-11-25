import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import {
  privacyRequestTypes,
  supportAppealWindowDays,
  supportCategories,
  supportMessageMaxLength,
  supportReportReasons,
  supportSummaryMaxLength,
  type PrivacyRequestType,
  type SupportCaseDetail,
  type SupportCaseMessage,
  type SupportCaseSummary,
  type SupportCategory,
  type SupportPriority,
  type SupportReportReason,
  type SupportStatus,
} from '@katondo/contracts';
import { requireAnyRole, type AuthenticatedRequest } from './access.js';
import { recordActivity } from './activity.js';
import { ensurePlatformUser, findPlatformUserId } from './identity.js';
import { cleanReviewText } from './reviews.js';

type Authenticate = (request: AuthenticatedRequest, response: Response, next: NextFunction) => Promise<void>;

/** Help and complaints stay off until sign-in is live. Never switch on to "test" in production. */
export const supportEnabled = () => process.env.SUPPORT_ENABLED === 'true';

export const supportStaffRoles = ['super_administrator', 'administrator', 'customer_support'] as const;
const supportViewerRoles = [...supportStaffRoles, 'auditor'] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const referencePattern = /^KT-\d{4}-\d{5,}$/;
const emailPattern = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const casesPerDay = 10;
const priorityRank: Record<SupportPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Target time to first reply and to a decision, by priority. */
const targets: Record<SupportPriority, { firstResponseHours: number; resolutionDays: number }> = {
  urgent: { firstResponseHours: 4, resolutionDays: 2 },
  high: { firstResponseHours: 24, resolutionDays: 5 },
  normal: { firstResponseHours: 48, resolutionDays: 10 },
  low: { firstResponseHours: 120, resolutionDays: 15 },
};

/** Days to answer a personal-data request. Confirm the legal deadline with Zambian counsel. */
const privacyResponseDays = () => Math.max(1, Number(process.env.PRIVACY_REQUEST_RESPONSE_DAYS) || 30);

function defaultPriority(category: SupportCategory, reason: SupportReportReason | null): SupportPriority {
  if ((category === 'report_listing' || category === 'report_shop') && (reason === 'prohibited' || reason === 'scam')) return 'urgent';
  if (category === 'report_listing' || category === 'report_shop' || category === 'order_problem' || category === 'privacy_request') return 'high';
  return 'normal';
}

function dueDates(priority: SupportPriority, category: SupportCategory, from = new Date()) {
  const target = targets[priority];
  const firstResponse = new Date(from.getTime() + target.firstResponseHours * 3_600_000);
  const days = category === 'privacy_request' ? privacyResponseDays() : target.resolutionDays;
  return { firstResponse, resolution: new Date(from.getTime() + days * 86_400_000) };
}

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;

function cleanText(value: unknown, max: number) {
  const text = cleanReviewText(value);
  return text.length > max ? null : text;
}

/** In-memory limit for requests from people without an account. Addresses are never stored. */
const anonymousHits = new Map<string, number[]>();
function anonymousLimited(request: Request) {
  const key = String(request.ip ?? 'unknown');
  const now = Date.now();
  const recent = (anonymousHits.get(key) ?? []).filter((time) => now - time < 3_600_000);
  recent.push(now);
  anonymousHits.set(key, recent);
  if (anonymousHits.size > 5000) anonymousHits.clear();
  return recent.length > 5;
}

export function createSupportRouter(pool: Pool, authenticate: Authenticate) {
  const router = Router();

  function requireSupport(_request: Request, response: Response, next: NextFunction) {
    if (!supportEnabled()) {
      response.status(503).json({ error: 'Help and complaints open once sign-in is switched on.' });
      return;
    }
    next();
  }

  async function audit(client: Pool | PoolClient, actorUserId: string | null, eventType: string, caseId: string, details: Record<string, unknown> = {}) {
    await client.query(
      `INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details) VALUES ($1, $2, 'support_case', $3, $4)`,
      [actorUserId, eventType, caseId, JSON.stringify(details)],
    );
  }

  async function nextReference(client: Pool | PoolClient) {
    const result = await client.query(`SELECT 'KT-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('support_case_number_seq')::text, 5, '0') AS reference`);
    return result.rows[0].reference as string;
  }

  /** Checks that what's being reported exists and, for orders, that the requester took part. */
  async function resolveSubject(type: 'listing' | 'seller' | 'review' | 'order', id: string, userId: string) {
    if (!uuidPattern.test(id)) return null;
    const queries = {
      listing: [`SELECT title AS label FROM listings WHERE id = $1`, [id]],
      seller: [`SELECT display_name AS label FROM sellers WHERE id = $1`, [id]],
      review: [`SELECT 'Review on ' || o.listing_title AS label FROM reviews r JOIN orders o ON o.id = r.order_id WHERE r.id = $1`, [id]],
      order: [`SELECT o.listing_title AS label FROM orders o JOIN sellers s ON s.id = o.seller_id WHERE o.id = $1 AND (o.buyer_user_id = $2 OR s.user_id = $2)`, [id, userId]],
    } as const;
    const [sql, params] = queries[type];
    const result = await pool.query(sql, [...params]);
    return result.rows[0]?.label as string | undefined ?? null;
  }

  function summaryRow(row: Record<string, any>): SupportCaseSummary {
    return {
      reference: row.reference,
      category: row.category,
      summary: row.summary,
      status: row.status,
      createdAt: iso(row.created_at)!,
      updatedAt: iso(row.updated_at)!,
      unread: Number(row.unread ?? 0),
      isAppeal: Boolean(row.appeal_of_case_id),
    };
  }

  async function caseForRequester(reference: string, userId: string) {
    if (!referencePattern.test(reference)) return null;
    const result = await pool.query(`
      SELECT c.*, original.reference AS appeal_of_reference, appeal.reference AS appeal_reference
      FROM support_cases c
      LEFT JOIN support_cases original ON original.id = c.appeal_of_case_id
      LEFT JOIN support_cases appeal ON appeal.appeal_of_case_id = c.id
      WHERE c.reference = $1 AND c.requester_user_id = $2
    `, [reference, userId]);
    return result.rows[0] ?? null;
  }

  async function createCase(client: PoolClient, input: {
    category: SupportCategory; summary: string; details: string; requesterUserId: string | null;
    contactName?: string | null; contactEmail?: string | null; subjectType?: string | null; subjectId?: string | null;
    subjectLabel?: string | null; reportReason?: SupportReportReason | null; privacyRequestType?: PrivacyRequestType | null;
    priority: SupportPriority; appealOfCaseId?: string | null;
  }) {
    const reference = await nextReference(client);
    const due = dueDates(input.priority, input.category);
    const created = await client.query(`
      INSERT INTO support_cases (reference, category, summary, subject_type, subject_id, subject_label, report_reason,
        privacy_request_type, requester_user_id, contact_name, contact_email, priority, first_response_due_at,
        resolution_due_at, appeal_of_case_id, requester_last_read_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      RETURNING id
    `, [reference, input.category, input.summary, input.subjectType ?? null, input.subjectId ?? null, input.subjectLabel ?? null,
      input.reportReason ?? null, input.privacyRequestType ?? null, input.requesterUserId, input.contactName ?? null,
      input.contactEmail ?? null, input.priority, due.firstResponse, due.resolution, input.appealOfCaseId ?? null]);
    const caseId = created.rows[0].id as string;
    await client.query(
      `INSERT INTO support_case_messages (case_id, author_type, author_user_id, body) VALUES ($1, 'requester', $2, $3)`,
      [caseId, input.requesterUserId, input.details],
    );
    await audit(client, input.requesterUserId, input.appealOfCaseId ? 'support.appeal_opened' : 'support.case_opened', caseId, { category: input.category, priority: input.priority });
    return { caseId, reference };
  }

  /* ---------- Requesters ---------- */

  // Signed-in: open a case.
  router.post('/api/support/cases', authenticate, requireSupport, async (request: AuthenticatedRequest, response) => {
    const body = request.body ?? {};
    const category = supportCategories.find((item) => item.id === body.category);
    const summary = cleanText(body.summary, supportSummaryMaxLength);
    const details = cleanText(body.details, supportMessageMaxLength);
    const reportReason = body.reportReason ? supportReportReasons.find((item) => item.id === body.reportReason)?.id ?? null : null;
    const privacyType = body.privacyRequestType ? privacyRequestTypes.find((item) => item.id === body.privacyRequestType)?.id ?? null : null;

    if (!category) return void response.status(400).json({ error: 'Choose what your request is about.' });
    if (!summary || summary.length < 3) return void response.status(400).json({ error: `Give your request a short title (up to ${supportSummaryMaxLength} characters).` });
    if (!details || details.length < 10) return void response.status(400).json({ error: 'Describe what happened in at least 10 characters.' });
    if (category.id.startsWith('report_') && !reportReason) return void response.status(400).json({ error: 'Choose why you are reporting this.' });
    if (category.id === 'privacy_request' && !privacyType) return void response.status(400).json({ error: 'Choose what you would like us to do with your data.' });

    const client = await pool.connect();
    try {
      const userId = await ensurePlatformUser(client, request.user!);
      let subjectLabel: string | null = null;
      let subjectId: string | null = null;
      const subjectType = category.subject ?? null;
      if (subjectType && body.subjectId) {
        subjectId = String(body.subjectId);
        subjectLabel = await resolveSubject(subjectType, subjectId, userId);
        if (!subjectLabel) return void response.status(404).json({ error: 'We couldn’t find what you’re reporting. It may have been removed.' });
      } else if (category.id.startsWith('report_')) {
        return void response.status(400).json({ error: 'Open the listing, shop or review you want to report and use its Report link.' });
      }

      const recent = await client.query(`SELECT COUNT(*) FROM support_cases WHERE requester_user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [userId]);
      if (Number(recent.rows[0].count) >= casesPerDay) return void response.status(429).json({ error: 'You’ve opened a lot of requests today. Add details to an existing one, or try again tomorrow.' });

      if (subjectId) {
        const existing = await client.query(
          `SELECT reference FROM support_cases WHERE requester_user_id = $1 AND subject_type = $2 AND subject_id = $3 AND status <> 'resolved' AND appeal_of_case_id IS NULL`,
          [userId, subjectType, subjectId],
        );
        if (existing.rowCount) return void response.status(409).json({ error: `You already have an open request about this: ${existing.rows[0].reference}.`, reference: existing.rows[0].reference });
      }

      await client.query('BEGIN');
      const created = await createCase(client, {
        category: category.id, summary, details, requesterUserId: userId,
        subjectType: subjectId ? subjectType : null, subjectId, subjectLabel,
        reportReason, privacyRequestType: privacyType, priority: defaultPriority(category.id, reportReason),
      });
      await client.query('COMMIT');
      await recordActivity(pool, request, request.user!.actorType === 'staff' ? 'staff' : 'buyer', 'support.case_opened', { subjectType: 'support_case', subjectId: created.caseId, metadata: { category: category.id } });
      response.status(201).json({ reference: created.reference });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Support case creation failed', error);
      response.status(503).json({ error: 'Your request could not be sent. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  // No account needed: a personal-data request. Nothing about the sender is kept except what they type.
  router.post('/api/support/privacy-requests', requireSupport, async (request, response) => {
    const body = request.body ?? {};
    if (body.website) return void response.status(201).json({ reference: null }); // Honeypot field: bots fill it in.
    if (anonymousLimited(request)) return void response.status(429).json({ error: 'Too many requests. Try again in an hour.' });
    const name = cleanText(body.name, 120);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const type = privacyRequestTypes.find((item) => item.id === body.requestType)?.id;
    const details = cleanText(body.details, supportMessageMaxLength);
    if (!name || name.length < 2) return void response.status(400).json({ error: 'Enter your name.' });
    if (!emailPattern.test(email)) return void response.status(400).json({ error: 'Enter an email address we can reply to.' });
    if (!type) return void response.status(400).json({ error: 'Choose what you would like us to do with your data.' });
    if (!details || details.length < 10) return void response.status(400).json({ error: 'Tell us a little more, in at least 10 characters.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await createCase(client, {
        category: 'privacy_request', summary: privacyRequestTypes.find((item) => item.id === type)!.label, details,
        requesterUserId: null, contactName: name, contactEmail: email, privacyRequestType: type, priority: 'high',
      });
      await client.query('COMMIT');
      response.status(201).json({ reference: created.reference });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Privacy request failed', error);
      response.status(503).json({ error: 'Your request could not be sent. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  // Signed-in: my cases.
  router.get('/api/support/cases', authenticate, requireSupport, async (request: AuthenticatedRequest, response) => {
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      if (!userId) return void response.json({ cases: [] });
      const result = await pool.query(`
        SELECT c.*, (
          SELECT COUNT(*) FROM support_case_messages m
          WHERE m.case_id = c.id AND m.author_type <> 'requester' AND m.internal = FALSE
            AND m.created_at > COALESCE(c.requester_last_read_at, 'epoch')
        ) AS unread
        FROM support_cases c WHERE c.requester_user_id = $1
        ORDER BY (c.status = 'resolved'), c.updated_at DESC LIMIT 100
      `, [userId]);
      response.json({ cases: result.rows.map(summaryRow) });
    } catch (error) {
      console.error('Support case list failed', error);
      response.status(503).json({ error: 'Your requests could not be loaded.' });
    }
  });

  // Signed-in: one of my cases, with the conversation. Opening it marks staff replies as read.
  router.get('/api/support/cases/:reference', authenticate, requireSupport, async (request: AuthenticatedRequest, response) => {
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      const row = userId ? await caseForRequester(String(request.params.reference), userId) : null;
      if (!row) return void response.status(404).json({ error: 'Request not found.' });
      const messages = await pool.query(
        `SELECT id, author_type, body, created_at FROM support_case_messages WHERE case_id = $1 AND internal = FALSE ORDER BY created_at`,
        [row.id],
      );
      await pool.query(`UPDATE support_cases SET requester_last_read_at = NOW() WHERE id = $1`, [row.id]);
      const withinAppealWindow = row.resolved_at && Date.now() - new Date(row.resolved_at).getTime() < supportAppealWindowDays * 86_400_000;
      const payload: SupportCaseDetail = {
        ...summaryRow({ ...row, unread: 0 }),
        subjectLabel: row.subject_label,
        reportReason: row.report_reason,
        privacyRequestType: row.privacy_request_type,
        resolution: row.resolution,
        resolvedAt: iso(row.resolved_at),
        messages: messages.rows.map((message): SupportCaseMessage => ({
          id: message.id,
          author: message.author_type === 'requester' ? 'you' : message.author_type === 'staff' ? 'katondo' : 'system',
          body: message.body,
          createdAt: iso(message.created_at)!,
        })),
        canReply: row.status !== 'resolved',
        canAppeal: row.status === 'resolved' && !row.appeal_of_case_id && !row.appeal_reference && Boolean(withinAppealWindow),
        appealReference: row.appeal_reference,
        appealOfReference: row.appeal_of_reference,
      };
      response.json(payload);
    } catch (error) {
      console.error('Support case request failed', error);
      response.status(503).json({ error: 'This request could not be loaded.' });
    }
  });

  // Signed-in: add a message to my open case.
  router.post('/api/support/cases/:reference/messages', authenticate, requireSupport, async (request: AuthenticatedRequest, response) => {
    const body = cleanText(request.body?.body, supportMessageMaxLength);
    if (!body) return void response.status(400).json({ error: `Write a message of up to ${supportMessageMaxLength.toLocaleString('en')} characters.` });
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      const row = userId ? await caseForRequester(String(request.params.reference), userId) : null;
      if (!row) return void response.status(404).json({ error: 'Request not found.' });
      if (row.status === 'resolved') return void response.status(409).json({ error: 'This request is resolved. If you disagree with the decision, ask for it to be looked at again.' });
      await pool.query(`INSERT INTO support_case_messages (case_id, author_type, author_user_id, body) VALUES ($1, 'requester', $2, $3)`, [row.id, userId, body]);
      await pool.query(`
        UPDATE support_cases SET updated_at = NOW(), requester_last_read_at = NOW(),
          status = CASE WHEN status = 'waiting_on_requester' THEN 'in_review' ELSE status END
        WHERE id = $1`, [row.id]);
      response.status(201).json({ ok: true });
    } catch (error) {
      console.error('Support reply failed', error);
      response.status(503).json({ error: 'Your message could not be sent. Try again in a moment.' });
    }
  });

  // Signed-in: ask for a resolved decision to be looked at again, once, by a different staff member.
  router.post('/api/support/cases/:reference/appeal', authenticate, requireSupport, async (request: AuthenticatedRequest, response) => {
    const reason = cleanText(request.body?.reason, supportMessageMaxLength);
    if (!reason || reason.length < 10) return void response.status(400).json({ error: 'Explain why you disagree, in at least 10 characters.' });
    const client = await pool.connect();
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      const row = userId ? await caseForRequester(String(request.params.reference), userId) : null;
      if (!row) return void response.status(404).json({ error: 'Request not found.' });
      if (row.status !== 'resolved') return void response.status(409).json({ error: 'You can ask for a decision to be looked at again once it has been made.' });
      if (row.appeal_of_case_id) return void response.status(409).json({ error: 'This is already a second look at an earlier decision.' });
      if (row.appeal_reference) return void response.status(409).json({ error: `You’ve already asked for this to be looked at again: ${row.appeal_reference}.` });
      if (Date.now() - new Date(row.resolved_at).getTime() > supportAppealWindowDays * 86_400_000) {
        return void response.status(409).json({ error: `Decisions can be looked at again within ${supportAppealWindowDays} days.` });
      }
      await client.query('BEGIN');
      const created = await createCase(client, {
        category: row.category, summary: `Second look: ${row.summary}`.slice(0, supportSummaryMaxLength), details: reason,
        requesterUserId: userId!, subjectType: row.subject_type, subjectId: row.subject_id, subjectLabel: row.subject_label,
        reportReason: row.report_reason, privacyRequestType: row.privacy_request_type, priority: 'high', appealOfCaseId: row.id,
      });
      await client.query(
        `INSERT INTO support_case_messages (case_id, author_type, body) VALUES ($1, 'system', $2)`,
        [row.id, `You asked for this decision to be looked at again. Follow it in ${created.reference}.`],
      );
      await client.query('COMMIT');
      response.status(201).json({ reference: created.reference });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((error as { code?: string }).code === '23505') return void response.status(409).json({ error: 'You’ve already asked for this to be looked at again.' });
      console.error('Support appeal failed', error);
      response.status(503).json({ error: 'Your request could not be sent. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  /* ---------- Staff ---------- */

  async function staffCase(reference: string) {
    if (!referencePattern.test(reference)) return null;
    const result = await pool.query(`
      SELECT c.*, original.reference AS appeal_of_reference, original.resolved_by_user_id AS original_resolver,
        appeal.reference AS appeal_reference, requester.email AS requester_email,
        assignee.display_name AS assignee_name
      FROM support_cases c
      LEFT JOIN support_cases original ON original.id = c.appeal_of_case_id
      LEFT JOIN support_cases appeal ON appeal.appeal_of_case_id = c.id
      LEFT JOIN users requester ON requester.id = c.requester_user_id
      LEFT JOIN staff_members assignee ON assignee.user_id = c.assigned_to_user_id
      WHERE c.reference = $1
    `, [reference]);
    return result.rows[0] ?? null;
  }

  /** Staff can't handle their own case, and an appeal needs someone other than the original decision-maker. */
  function conflict(row: Record<string, any>, staffUserId: string) {
    if (row.requester_user_id === staffUserId) return 'You can’t handle your own request. Ask a colleague.';
    if (row.original_resolver && row.original_resolver === staffUserId) return 'You made the original decision, so a different staff member must handle this second look.';
    return null;
  }

  // Queue: overdue first, then by priority and due time.
  router.get('/api/admin/support/cases', authenticate, requireAnyRole([...supportViewerRoles]), async (request: AuthenticatedRequest, response) => {
    const view = ['open', 'resolved', 'mine', 'overdue'].includes(String(request.query.view)) ? String(request.query.view) : 'open';
    const category = supportCategories.some((item) => item.id === request.query.category) ? String(request.query.category) : null;
    try {
      const staffUserId = await findPlatformUserId(pool, request.user!);
      const result = await pool.query(`
        SELECT c.reference, c.category, c.summary, c.status, c.priority, c.created_at, c.updated_at,
          c.first_response_due_at, c.resolution_due_at, c.first_response_at, c.appeal_of_case_id,
          c.subject_label, assignee.display_name AS assignee_name, c.assigned_to_user_id = $3 AS assigned_to_me,
          (c.status <> 'resolved' AND ((c.first_response_at IS NULL AND c.first_response_due_at < NOW()) OR c.resolution_due_at < NOW())) AS overdue,
          CASE WHEN c.requester_user_id IS NULL THEN COALESCE(c.contact_name, 'No account') ELSE 'Signed-in user' END AS requester
        FROM support_cases c
        LEFT JOIN staff_members assignee ON assignee.user_id = c.assigned_to_user_id
        WHERE ($1 = 'resolved' AND c.status = 'resolved' OR $1 <> 'resolved' AND c.status <> 'resolved')
          AND ($1 <> 'mine' OR c.assigned_to_user_id = $3)
          AND ($1 <> 'overdue' OR ((c.first_response_at IS NULL AND c.first_response_due_at < NOW()) OR c.resolution_due_at < NOW()))
          AND ($2::text IS NULL OR c.category = $2)
        ORDER BY CASE WHEN $1 = 'resolved' THEN 0 ELSE 1 END, c.resolved_at DESC NULLS LAST,
          (c.status <> 'resolved' AND ((c.first_response_at IS NULL AND c.first_response_due_at < NOW()) OR c.resolution_due_at < NOW())) DESC,
          CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
          LEAST(CASE WHEN c.first_response_at IS NULL THEN c.first_response_due_at END, c.resolution_due_at)
        LIMIT 200
      `, [view, category, staffUserId]);
      const counts = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE status <> 'resolved') AS open,
          COUNT(*) FILTER (WHERE status <> 'resolved' AND ((first_response_at IS NULL AND first_response_due_at < NOW()) OR resolution_due_at < NOW())) AS overdue,
          COUNT(*) FILTER (WHERE status <> 'resolved' AND assigned_to_user_id IS NULL) AS unassigned
        FROM support_cases
      `);
      response.json({
        enabled: supportEnabled(),
        counts: { open: Number(counts.rows[0].open), overdue: Number(counts.rows[0].overdue), unassigned: Number(counts.rows[0].unassigned) },
        cases: result.rows.map((row) => ({
          reference: row.reference, category: row.category, summary: row.summary, status: row.status, priority: row.priority,
          createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), firstResponseDueAt: iso(row.first_response_due_at),
          resolutionDueAt: iso(row.resolution_due_at), firstResponseAt: iso(row.first_response_at), isAppeal: Boolean(row.appeal_of_case_id),
          subjectLabel: row.subject_label, assigneeName: row.assignee_name, assignedToMe: Boolean(row.assigned_to_me),
          overdue: Boolean(row.overdue), requester: row.requester,
        })),
      });
    } catch (error) {
      console.error('Support queue failed', error);
      response.status(503).json({ error: 'The queue could not be loaded.' });
    }
  });

  // One case, with internal notes and its audit history.
  router.get('/api/admin/support/cases/:reference', authenticate, requireAnyRole([...supportViewerRoles]), async (request: AuthenticatedRequest, response) => {
    try {
      const row = await staffCase(String(request.params.reference));
      if (!row) return void response.status(404).json({ error: 'Case not found.' });
      const [messages, history] = await Promise.all([
        pool.query(`
          SELECT m.id, m.author_type, m.body, m.internal, m.created_at, s.display_name AS staff_name
          FROM support_case_messages m LEFT JOIN staff_members s ON s.user_id = m.author_user_id AND m.author_type = 'staff'
          WHERE m.case_id = $1 ORDER BY m.created_at`, [row.id]),
        pool.query(`
          SELECT a.event_type, a.details, a.created_at, s.display_name AS actor_name
          FROM audit_events a LEFT JOIN staff_members s ON s.user_id = a.actor_user_id
          WHERE a.subject_type = 'support_case' AND a.subject_id = $1 ORDER BY a.created_at`, [row.id]),
      ]);
      response.json({
        reference: row.reference, category: row.category, summary: row.summary, status: row.status, priority: row.priority,
        subjectType: row.subject_type, subjectId: row.subject_id, subjectLabel: row.subject_label,
        reportReason: row.report_reason, privacyRequestType: row.privacy_request_type,
        requester: row.requester_user_id
          ? { account: true, email: row.requester_email ?? null }
          : { account: false, name: row.contact_name, email: row.contact_email },
        assigneeName: row.assignee_name, resolution: row.resolution, resolvedAt: iso(row.resolved_at),
        createdAt: iso(row.created_at), firstResponseDueAt: iso(row.first_response_due_at), resolutionDueAt: iso(row.resolution_due_at),
        firstResponseAt: iso(row.first_response_at), appealOfReference: row.appeal_of_reference, appealReference: row.appeal_reference,
        messages: messages.rows.map((message) => ({
          id: message.id, author: message.author_type, staffName: message.staff_name, body: message.body,
          internal: message.internal, createdAt: iso(message.created_at),
        })),
        history: history.rows.map((event) => ({ event: event.event_type, details: event.details, actorName: event.actor_name, createdAt: iso(event.created_at) })),
      });
    } catch (error) {
      console.error('Support case detail failed', error);
      response.status(503).json({ error: 'The case could not be loaded.' });
    }
  });

  /** Runs a staff change on an open case inside a transaction, after the conflict checks. */
  async function staffChange(
    request: AuthenticatedRequest, response: Response,
    change: (client: PoolClient, row: Record<string, any>, staffUserId: string) => Promise<{ status?: number; error?: string; body?: unknown }>,
  ) {
    const client = await pool.connect();
    try {
      const staffUserId = await ensurePlatformUser(client, request.user!);
      const row = await staffCase(String(request.params.reference));
      if (!row) return void response.status(404).json({ error: 'Case not found.' });
      const blocked = conflict(row, staffUserId);
      if (blocked) return void response.status(409).json({ error: blocked });
      await client.query('BEGIN');
      const result = await change(client, row, staffUserId);
      if (result.error) {
        await client.query('ROLLBACK');
        return void response.status(result.status ?? 409).json({ error: result.error });
      }
      await client.query(`UPDATE support_cases SET updated_at = NOW() WHERE id = $1`, [row.id]);
      await client.query('COMMIT');
      response.json(result.body ?? { ok: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Support staff change failed', error);
      response.status(503).json({ error: 'The case could not be updated. Try again in a moment.' });
    } finally {
      client.release();
    }
  }

  // Reply to the requester, or add an internal note.
  router.post('/api/admin/support/cases/:reference/messages', authenticate, requireAnyRole([...supportStaffRoles]), (request: AuthenticatedRequest, response) => {
    const body = cleanText(request.body?.body, supportMessageMaxLength);
    const internal = request.body?.internal === true;
    const waitForRequester = request.body?.waitForRequester === true;
    if (!body) return void response.status(400).json({ error: `Write a message of up to ${supportMessageMaxLength.toLocaleString('en')} characters.` });
    return staffChange(request, response, async (client, row, staffUserId) => {
      if (row.status === 'resolved') return { error: 'Reopen the case before replying.' };
      if (!internal && !row.requester_user_id) {
        // No account to reply to: the reply is recorded here and staff send it by email.
        await client.query(`INSERT INTO support_case_messages (case_id, author_type, author_user_id, body, internal) VALUES ($1, 'staff', $2, $3, TRUE)`,
          [row.id, staffUserId, `Reply sent by email to ${row.contact_email}:\n\n${body}`]);
      } else {
        await client.query(`INSERT INTO support_case_messages (case_id, author_type, author_user_id, body, internal) VALUES ($1, 'staff', $2, $3, $4)`,
          [row.id, staffUserId, body, internal]);
      }
      if (!internal) {
        await client.query(`
          UPDATE support_cases SET first_response_at = COALESCE(first_response_at, NOW()),
            status = $2, assigned_to_user_id = COALESCE(assigned_to_user_id, $3) WHERE id = $1`,
          [row.id, waitForRequester ? 'waiting_on_requester' : 'in_review', staffUserId]);
      }
      await audit(client, staffUserId, internal ? 'support.note_added' : 'support.replied', row.id, internal ? {} : { waitingOnRequester: waitForRequester });
      return {};
    });
  });

  // Assign to me, or unassign.
  router.post('/api/admin/support/cases/:reference/assign', authenticate, requireAnyRole([...supportStaffRoles]), (request: AuthenticatedRequest, response) => {
    const toMe = request.body?.assignee !== 'none';
    return staffChange(request, response, async (client, row, staffUserId) => {
      if (row.status === 'resolved') return { error: 'This case is resolved.' };
      await client.query(`UPDATE support_cases SET assigned_to_user_id = $2, status = CASE WHEN status = 'received' AND $2::uuid IS NOT NULL THEN 'in_review' ELSE status END WHERE id = $1`,
        [row.id, toMe ? staffUserId : null]);
      await audit(client, staffUserId, toMe ? 'support.assigned' : 'support.unassigned', row.id);
      return {};
    });
  });

  // Change priority (with a reason). Due times are recalculated from when the case was opened.
  router.post('/api/admin/support/cases/:reference/priority', authenticate, requireAnyRole([...supportStaffRoles]), (request: AuthenticatedRequest, response) => {
    const priority = request.body?.priority as SupportPriority;
    const reason = cleanText(request.body?.reason, 500);
    if (!(priority in priorityRank)) return void response.status(400).json({ error: 'Choose a priority.' });
    if (!reason || reason.length < 3) return void response.status(400).json({ error: 'Add a reason for the change.' });
    return staffChange(request, response, async (client, row, staffUserId) => {
      if (row.status === 'resolved') return { error: 'This case is resolved.' };
      const due = dueDates(priority, row.category, new Date(row.created_at));
      await client.query(`UPDATE support_cases SET priority = $2, first_response_due_at = $3, resolution_due_at = $4 WHERE id = $1`,
        [row.id, priority, due.firstResponse, due.resolution]);
      await audit(client, staffUserId, 'support.priority_changed', row.id, { from: row.priority, to: priority, reason });
      return {};
    });
  });

  // Decide the case. The decision is shown to the requester.
  router.post('/api/admin/support/cases/:reference/resolve', authenticate, requireAnyRole([...supportStaffRoles]), (request: AuthenticatedRequest, response) => {
    const resolution = cleanText(request.body?.resolution, 2000);
    if (!resolution || resolution.length < 10) return void response.status(400).json({ error: 'Explain the decision to the requester in at least 10 characters.' });
    return staffChange(request, response, async (client, row, staffUserId) => {
      if (row.status === 'resolved') return { error: 'This case is already resolved.' };
      await client.query(`
        UPDATE support_cases SET status = 'resolved', resolution = $2, resolved_by_user_id = $3, resolved_at = NOW(),
          first_response_at = COALESCE(first_response_at, NOW()), assigned_to_user_id = COALESCE(assigned_to_user_id, $3)
        WHERE id = $1`, [row.id, resolution, staffUserId]);
      await client.query(`INSERT INTO support_case_messages (case_id, author_type, author_user_id, body, internal) VALUES ($1, 'staff', $2, $3, $4)`,
        [row.id, staffUserId, row.requester_user_id ? `Decision: ${resolution}` : `Decision sent by email to ${row.contact_email}:\n\n${resolution}`, !row.requester_user_id]);
      await audit(client, staffUserId, 'support.resolved', row.id);
      return {};
    });
  });

  // Reopen a resolved case (not once a second look has been requested).
  router.post('/api/admin/support/cases/:reference/reopen', authenticate, requireAnyRole([...supportStaffRoles]), (request: AuthenticatedRequest, response) => {
    const reason = cleanText(request.body?.reason, 500);
    if (!reason || reason.length < 3) return void response.status(400).json({ error: 'Add a reason for reopening.' });
    return staffChange(request, response, async (client, row, staffUserId) => {
      if (row.status !== 'resolved') return { error: 'This case is already open.' };
      if (row.appeal_reference) return { error: `A second look is already under way in ${row.appeal_reference}.` };
      await client.query(`UPDATE support_cases SET status = 'in_review', resolution = NULL, resolved_by_user_id = NULL, resolved_at = NULL WHERE id = $1`, [row.id]);
      await client.query(`INSERT INTO support_case_messages (case_id, author_type, body) VALUES ($1, 'system', 'Katondo reopened this request.')`, [row.id]);
      await audit(client, staffUserId, 'support.reopened', row.id, { reason });
      return {};
    });
  });

  return router;
}

export type { SupportStatus };
