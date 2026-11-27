import { Router, type NextFunction, type Response } from 'express';
import type { Pool } from 'pg';
import {
  reviewCommentMaxLength,
  reviewWindowDays,
  type OrderReviewState,
  type PublicReview,
  type RatingSummary,
  type ReviewAuthorRole,
  type ShopReviewsResponse,
} from '@katondo/contracts';
import { requireAnyRole, type AuthenticatedRequest } from './access.js';
import { recordActivity } from './activity.js';
import { ensurePlatformUser, findPlatformUserId } from './identity.js';

type Authenticate = (request: AuthenticatedRequest, response: Response, next: NextFunction) => Promise<void>;

/** Reviews stay off until checkout creates real orders. Never switch on to "test" in production. */
export const reviewsEnabled = () => process.env.REVIEWS_ENABLED === 'true';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const windowInterval = `INTERVAL '${reviewWindowDays} days'`;
export const reviewModeratorRoles = ['super_administrator', 'administrator', 'customer_support'] as const;
const reviewViewerRoles = [...reviewModeratorRoles, 'auditor'] as const;

/**
 * SQL condition: review `r` (on order `o`) can be shown to people other than its author.
 * Both sides must have reviewed, or the review window must have closed, so nobody can
 * read the other review before writing their own.
 */
const revealedSql = `(
  r.status = 'active' AND (
    EXISTS (SELECT 1 FROM reviews other WHERE other.order_id = r.order_id AND other.author_role <> r.author_role)
    OR o.completed_at + ${windowInterval} < NOW()
  )
)`;

const emptySummary = (): RatingSummary => ({ average: null, count: 0, distribution: [0, 0, 0, 0, 0] });

function summarise(rows: Array<{ rating: number; count: string | number }>): RatingSummary {
  const summary = emptySummary();
  let total = 0;
  for (const row of rows) {
    const rating = Number(row.rating);
    const count = Number(row.count);
    if (rating < 1 || rating > 5) continue;
    summary.distribution[rating - 1] = count;
    summary.count += count;
    total += rating * count;
  }
  summary.average = summary.count ? Math.round((total / summary.count) * 10) / 10 : null;
  return summary;
}

function toPublicReview(row: Record<string, any>): PublicReview {
  const iso = (value: unknown) => value instanceof Date ? value.toISOString() : value ? String(value) : null;
  return {
    id: row.id,
    rating: Number(row.rating),
    comment: row.comment ?? null,
    listingTitle: row.listing_title,
    createdAt: iso(row.created_at)!,
    reply: row.reply ?? null,
    repliedAt: iso(row.replied_at),
  };
}

/** Trims, removes control characters and collapses runs of blank lines. */
export function cleanReviewText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateReviewInput(body: Record<string, unknown> | undefined):
  { value: { rating: number; comment: string | null } } | { error: string } {
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Choose a rating from 1 to 5 stars.' };
  const comment = cleanReviewText(body?.comment);
  if (comment.length > reviewCommentMaxLength) return { error: `Keep your review to ${reviewCommentMaxLength.toLocaleString('en')} characters or fewer.` };
  // Low ratings need a reason, so the other person and staff can understand what went wrong.
  if (rating <= 2 && comment.length < 10) return { error: 'Tell us what went wrong in at least 10 characters.' };
  return { value: { rating, comment: comment || null } };
}

export function createReviewsRouter(pool: Pool, authenticate: Authenticate) {
  const router = Router();

  function requireReviews(_request: AuthenticatedRequest, response: Response, next: NextFunction) {
    if (!reviewsEnabled()) {
      response.status(503).json({ error: 'Reviews open once checkout is switched on.' });
      return;
    }
    next();
  }

  async function sellerRating(sellerId: string) {
    const result = await pool.query(`
      SELECT r.rating, COUNT(*) AS count
      FROM reviews r JOIN orders o ON o.id = r.order_id
      WHERE r.author_role = 'buyer' AND r.subject_seller_id = $1 AND ${revealedSql}
      GROUP BY r.rating
    `, [sellerId]);
    return summarise(result.rows);
  }

  async function buyerRating(userId: string) {
    const result = await pool.query(`
      SELECT r.rating, COUNT(*) AS count
      FROM reviews r JOIN orders o ON o.id = r.order_id
      WHERE r.author_role = 'seller' AND r.subject_user_id = $1 AND ${revealedSql}
      GROUP BY r.rating
    `, [userId]);
    return summarise(result.rows);
  }

  /** Loads an order and works out whether the signed-in person is its buyer or its seller. */
  async function orderForParticipant(orderId: string, userId: string) {
    const result = await pool.query(`
      SELECT o.id, o.buyer_user_id, o.seller_id, o.listing_title, o.status, o.completed_at,
        o.completed_at + ${windowInterval} AS window_closes_at,
        o.completed_at + ${windowInterval} < NOW() AS window_closed,
        s.user_id AS seller_user_id, s.display_name AS seller_name
      FROM orders o JOIN sellers s ON s.id = o.seller_id
      WHERE o.id = $1 AND (o.buyer_user_id = $2 OR s.user_id = $2)
    `, [orderId, userId]);
    const order = result.rows[0];
    if (!order) return null;
    if (order.buyer_user_id === order.seller_user_id) return { order, role: null };
    const role: ReviewAuthorRole = order.buyer_user_id === userId ? 'buyer' : 'seller';
    return { order, role };
  }

  // Public: a shop's rating and its visible buyer reviews.
  router.get('/api/shops/:sellerId/reviews', async (request: AuthenticatedRequest, response) => {
    const sellerId = String(request.params.sellerId);
    if (!reviewsEnabled()) {
      const payload: ShopReviewsResponse = { enabled: false, summary: emptySummary(), reviews: [] };
      response.json(payload);
      return;
    }
    if (!uuidPattern.test(sellerId)) {
      response.status(404).json({ error: 'Shop not found.' });
      return;
    }
    const limit = Math.min(Math.max(Number(request.query.limit) || 20, 1), 50);
    try {
      const shop = await pool.query(
        `SELECT id FROM sellers WHERE id = $1 AND (verification_status = 'verified' OR seller_type = 'platform')
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = sellers.user_id AND u.status <> 'active')`,
        [sellerId],
      );
      if (!shop.rowCount) {
        response.status(404).json({ error: 'Shop not found.' });
        return;
      }
      const [summary, reviews] = await Promise.all([
        sellerRating(sellerId),
        pool.query(`
          SELECT r.id, r.rating, r.comment, r.reply, r.replied_at, r.created_at, o.listing_title
          FROM reviews r JOIN orders o ON o.id = r.order_id
          WHERE r.author_role = 'buyer' AND r.subject_seller_id = $1 AND ${revealedSql}
          ORDER BY r.created_at DESC LIMIT $2
        `, [sellerId, limit]),
      ]);
      const payload: ShopReviewsResponse = { enabled: true, summary, reviews: reviews.rows.map(toPublicReview) };
      response.json(payload);
    } catch (error) {
      console.error('Shop reviews request failed', error);
      response.status(503).json({ error: 'Reviews are temporarily unavailable.' });
    }
  });

  // Buyer or seller: review status for one of their orders.
  router.get('/api/orders/:orderId/review', authenticate, requireReviews, async (request: AuthenticatedRequest, response) => {
    const orderId = String(request.params.orderId);
    if (!uuidPattern.test(orderId)) {
      response.status(404).json({ error: 'Order not found.' });
      return;
    }
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      const found = userId ? await orderForParticipant(orderId, userId) : null;
      if (!found) {
        response.status(404).json({ error: 'Order not found.' });
        return;
      }
      const { order, role } = found;
      if (!role) {
        response.status(403).json({ error: 'You can’t review an order from your own shop.' });
        return;
      }
      const reviews = await pool.query(`
        SELECT r.*, o.listing_title, ${revealedSql} AS revealed
        FROM reviews r JOIN orders o ON o.id = r.order_id
        WHERE r.order_id = $1
      `, [orderId]);
      const mineRow = reviews.rows.find((row) => row.author_role === role);
      const theirsRow = reviews.rows.find((row) => row.author_role !== role);

      let reason: string | null = null;
      if (order.status !== 'completed') reason = 'You can review this order once it’s completed.';
      else if (mineRow) reason = 'You’ve already reviewed this order.';
      else if (order.window_closed) reason = `Reviews close ${reviewWindowDays} days after an order is completed.`;

      const payload: OrderReviewState = {
        enabled: true,
        orderId,
        role,
        listingTitle: order.listing_title,
        counterpartName: role === 'buyer' ? order.seller_name : 'Your buyer',
        canReview: reason === null,
        reason,
        windowClosesAt: order.window_closes_at instanceof Date ? order.window_closes_at.toISOString() : null,
        mine: mineRow ? { ...toPublicReview(mineRow), visible: Boolean(mineRow.revealed) } : null,
        theirs: theirsRow?.revealed ? toPublicReview(theirsRow) : null,
        buyerRating: role === 'seller' ? await buyerRating(order.buyer_user_id) : null,
      };
      response.json(payload);
    } catch (error) {
      console.error('Order review request failed', error);
      response.status(503).json({ error: 'Reviews are temporarily unavailable.' });
    }
  });

  // Buyer or seller: leave one review for a completed order.
  router.post('/api/orders/:orderId/review', authenticate, requireReviews, async (request: AuthenticatedRequest, response) => {
    const orderId = String(request.params.orderId);
    const parsed = validateReviewInput(request.body);
    if (!uuidPattern.test(orderId)) {
      response.status(404).json({ error: 'Order not found.' });
      return;
    }
    if ('error' in parsed) {
      response.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      const found = userId ? await orderForParticipant(orderId, userId) : null;
      if (!found) {
        response.status(404).json({ error: 'Order not found.' });
        return;
      }
      const { order, role } = found;
      if (!role) {
        response.status(403).json({ error: 'You can’t review an order from your own shop.' });
        return;
      }
      if (order.status !== 'completed') {
        response.status(409).json({ error: 'You can review this order once it’s completed.' });
        return;
      }
      if (order.window_closed) {
        response.status(409).json({ error: `Reviews close ${reviewWindowDays} days after an order is completed.` });
        return;
      }
      const result = await pool.query(`
        INSERT INTO reviews (order_id, author_role, author_user_id, subject_seller_id, subject_user_id, rating, comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        orderId, role, userId,
        role === 'buyer' ? order.seller_id : null,
        role === 'seller' ? order.buyer_user_id : null,
        parsed.value.rating, parsed.value.comment,
      ]);
      await recordActivity(pool, request, role === 'buyer' ? 'buyer' : 'seller', `${role}.review_submitted`, {
        subjectType: 'order', subjectId: orderId, metadata: { rating: parsed.value.rating },
      });
      response.status(201).json({ review: { id: result.rows[0].id } });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        response.status(409).json({ error: 'You’ve already reviewed this order.' });
        return;
      }
      console.error('Review submission failed', error);
      response.status(503).json({ error: 'Your review could not be saved. Try again in a moment.' });
    }
  });

  // Seller: reply publicly, once, to a buyer's review of their shop.
  router.post('/api/reviews/:reviewId/reply', authenticate, requireReviews, async (request: AuthenticatedRequest, response) => {
    const reviewId = String(request.params.reviewId);
    const reply = cleanReviewText(request.body?.reply);
    if (!uuidPattern.test(reviewId)) {
      response.status(404).json({ error: 'Review not found.' });
      return;
    }
    if (reply.length < 2 || reply.length > reviewCommentMaxLength) {
      response.status(400).json({ error: `Write a reply between 2 and ${reviewCommentMaxLength.toLocaleString('en')} characters.` });
      return;
    }
    try {
      const userId = await findPlatformUserId(pool, request.user!);
      if (!userId) {
        response.status(404).json({ error: 'Review not found.' });
        return;
      }
      const result = await pool.query(`
        UPDATE reviews r SET reply = $1, replied_at = NOW()
        FROM orders o, sellers s
        WHERE r.id = $2 AND o.id = r.order_id AND s.id = r.subject_seller_id AND s.user_id = $3
          AND r.author_role = 'buyer' AND r.reply IS NULL AND ${revealedSql}
        RETURNING r.id
      `, [reply, reviewId, userId]);
      if (!result.rowCount) {
        response.status(409).json({ error: 'You can reply once, after the review is visible.' });
        return;
      }
      await recordActivity(pool, request, 'seller', 'seller.review_replied', { subjectType: 'review', subjectId: reviewId });
      response.json({ review: { id: reviewId, reply } });
    } catch (error) {
      console.error('Review reply failed', error);
      response.status(503).json({ error: 'Your reply could not be saved. Try again in a moment.' });
    }
  });

  // Staff: list reviews for moderation, newest first.
  router.get('/api/admin/reviews', authenticate, requireAnyRole([...reviewViewerRoles]), async (request: AuthenticatedRequest, response) => {
    const status = request.query.status === 'hidden' ? 'hidden' : 'active';
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 100);
    try {
      const result = await pool.query(`
        SELECT r.id, r.order_id, r.author_role, r.rating, r.comment, r.reply, r.status, r.hidden_reason,
          r.hidden_at, r.created_at, o.listing_title, s.display_name AS seller_name
        FROM reviews r JOIN orders o ON o.id = r.order_id JOIN sellers s ON s.id = o.seller_id
        WHERE r.status = $1
        ORDER BY r.created_at DESC LIMIT $2
      `, [status, limit]);
      response.json({ enabled: reviewsEnabled(), reviews: result.rows });
    } catch (error) {
      console.error('Admin reviews request failed', error);
      response.status(503).json({ error: 'Reviews are temporarily unavailable.' });
    }
  });

  // Staff: hide an abusive review, or restore one. Every change is audited.
  router.post('/api/admin/reviews/:reviewId/:action', authenticate, requireAnyRole([...reviewModeratorRoles]), async (request: AuthenticatedRequest, response) => {
    const reviewId = String(request.params.reviewId);
    const action = String(request.params.action);
    const reason = cleanReviewText(request.body?.reason);
    if (!uuidPattern.test(reviewId) || !['hide', 'restore'].includes(action)) {
      response.status(404).json({ error: 'Review not found.' });
      return;
    }
    if (reason.length < 3 || reason.length > 500) {
      response.status(400).json({ error: 'Add a reason between 3 and 500 characters.' });
      return;
    }
    const client = await pool.connect();
    try {
      const staffUserId = await ensurePlatformUser(client, request.user!);
      await client.query('BEGIN');
      const result = action === 'hide'
        ? await client.query(`
            UPDATE reviews SET status = 'hidden', hidden_reason = $1, hidden_by_user_id = $2, hidden_at = NOW()
            WHERE id = $3 AND status = 'active' RETURNING id`, [reason, staffUserId, reviewId])
        : await client.query(`
            UPDATE reviews SET status = 'active', hidden_reason = NULL, hidden_by_user_id = NULL, hidden_at = NULL
            WHERE id = $1 AND status = 'hidden' RETURNING id`, [reviewId]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: action === 'hide' ? 'This review is already hidden.' : 'This review is already visible.' });
        return;
      }
      await client.query(`
        INSERT INTO audit_events (actor_user_id, event_type, subject_type, subject_id, details)
        VALUES ($1, $2, 'review', $3, $4)
      `, [staffUserId, action === 'hide' ? 'review.hidden' : 'review.restored', reviewId, JSON.stringify({ reason })]);
      await client.query('COMMIT');
      await recordActivity(pool, request, 'staff', `staff.review_${action === 'hide' ? 'hidden' : 'restored'}`, { subjectType: 'review', subjectId: reviewId });
      response.json({ review: { id: reviewId, status: action === 'hide' ? 'hidden' : 'active' } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error('Review moderation failed', error);
      response.status(503).json({ error: 'The review could not be updated. Try again in a moment.' });
    } finally {
      client.release();
    }
  });

  return router;
}
