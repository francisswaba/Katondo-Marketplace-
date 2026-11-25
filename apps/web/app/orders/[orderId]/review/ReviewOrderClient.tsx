'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'oidc-client-ts';
import { reviewCommentMaxLength, type OrderReviewState, type PublicReview } from '@katondo/contracts';
import Stars, { ratingLabel } from '../../../../components/Stars';
import { apiUrl } from '../../../../lib/catalogue';
import { getUserManager, isCurrentUser } from '../../../../lib/oidc';

const starWords = ['', 'Poor', 'Below expectations', 'Okay', 'Good', 'Excellent'];

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'Something went wrong. Try again.';
}

function ReviewBlock({ title, review }: { title: string; review: PublicReview }) {
  return (
    <section className="review-block">
      <h2>{title}</h2>
      <div className="review-meta">
        <Stars rating={review.rating} />
        <span>{starWords[review.rating]}</span>
      </div>
      {review.comment && <p className="review-text">{review.comment}</p>}
      {review.reply && <div className="review-reply"><strong>Seller’s reply</strong><p>{review.reply}</p></div>}
    </section>
  );
}

export default function ReviewOrderClient({ orderId }: { orderId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [checkedUser, setCheckedUser] = useState(false);
  const [state, setState] = useState<OrderReviewState | null>(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const manager = getUserManager();
    if (!manager) { setCheckedUser(true); return; }
    manager.getUser()
      .then((current) => setUser(isCurrentUser(current) ? current : null))
      .catch(() => setUser(null))
      .finally(() => setCheckedUser(true));
  }, []);

  async function load(token: string) {
    const response = await fetch(`${apiUrl}/api/orders/${encodeURIComponent(orderId)}/review`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(await readError(response));
    setState(await response.json() as OrderReviewState);
  }

  useEffect(() => {
    if (!user?.access_token) return;
    load(user.access_token).catch((loadError: Error) => setError(loadError.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.access_token) return;
    if (!rating) { setError('Choose a star rating.'); return; }
    if (rating <= 2 && comment.trim().length < 10) { setError('Tell us what went wrong in at least 10 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/orders/${encodeURIComponent(orderId)}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await load(user.access_token);
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.access_token || !state?.theirs) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/reviews/${state.theirs.id}/reply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await load(user.access_token);
    } catch (replyError) {
      setError((replyError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!checkedUser) return <p className="review-status" role="status">Loading…</p>;

  if (!user) {
    return (
      <div className="order-review">
        <h1>Leave a review</h1>
        <p>Sign in with the account you used for this order to review it.</p>
        <button className="button-primary" type="button" disabled={!getUserManager()}
          onClick={() => getUserManager()?.signinRedirect({ state: { returnTo: `/orders/${orderId}/review` } })}>
          Sign in
        </button>
        {!getUserManager() && <p className="review-status">Sign-in opens once account approvals are complete.</p>}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="order-review">
        <h1>Leave a review</h1>
        <p className="review-status" role="status">{error || 'Loading your order…'}</p>
      </div>
    );
  }

  const isBuyer = state.role === 'buyer';
  const closes = state.windowClosesAt ? new Date(state.windowClosesAt).toLocaleDateString('en-ZM', { day: 'numeric', month: 'long' }) : null;
  const theirsTitle = isBuyer ? `${state.counterpartName}’s review of you` : 'The buyer’s review of your shop';

  return (
    <div className="order-review">
      <h1>{isBuyer ? `How was ${state.counterpartName}?` : 'How was your buyer?'}</h1>
      <p className="review-order">Order: {state.listingTitle}</p>

      {!isBuyer && state.buyerRating && (
        <p className="review-buyer-rating">
          {state.buyerRating.count && state.buyerRating.average !== null
            ? <><Stars rating={state.buyerRating.average} size={14} /> <span>{ratingLabel(state.buyerRating.average, state.buyerRating.count)} by sellers</span></>
            : 'This buyer has no reviews from sellers yet.'}
        </p>
      )}

      {state.canReview && (
        <form className="review-form" onSubmit={submit}>
          <fieldset className="star-picker">
            <legend>Your rating</legend>
            <div>
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} className={value <= rating ? 'on' : undefined}>
                  <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />
                  <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path d="M12 2.6l2.83 5.74 6.33.92-4.58 4.47 1.08 6.3L12 17.05l-5.66 2.98 1.08-6.3L2.84 9.26l6.33-.92z" /></svg>
                  <span className="visually-hidden">{value} star{value === 1 ? '' : 's'}: {starWords[value]}</span>
                </label>
              ))}
            </div>
            <p aria-live="polite">{starWords[rating] || 'Tap a star'}</p>
          </fieldset>
          <label className="review-comment">
            {rating && rating <= 2 ? 'What went wrong?' : 'Tell others about it (optional)'}
            <textarea value={comment} maxLength={reviewCommentMaxLength} rows={5} onChange={(event) => setComment(event.target.value)}
              placeholder={isBuyer ? 'Was the item as described? How was meeting up or delivery?' : 'Did they pay and collect as agreed?'} />
            <small>{comment.length} / {reviewCommentMaxLength.toLocaleString('en')}</small>
          </label>
          <p className="review-rules">
            {isBuyer ? state.counterpartName : 'Your buyer'} won’t see your review until they’ve left theirs, or until reviews close{closes ? ` on ${closes}` : ''}. You can’t change it afterwards.
          </p>
          {error && <p className="studio-message error" role="alert">{error}</p>}
          <button className="button-primary" type="submit" disabled={saving}>{saving ? 'Posting…' : 'Post review'}</button>
        </form>
      )}

      {!state.canReview && !state.mine && <p className="studio-message">{state.reason}</p>}

      {state.mine && (
        <>
          <p className="studio-message success" role="status">
            {state.mine.visible ? 'Your review is posted.' : `Review posted. It appears once ${isBuyer ? state.counterpartName : 'your buyer'} reviews you${closes ? ` or on ${closes}` : ''}.`}
          </p>
          <ReviewBlock title="Your review" review={state.mine} />
        </>
      )}

      {state.theirs && <ReviewBlock title={theirsTitle} review={state.theirs} />}

      {!isBuyer && state.theirs && !state.theirs.reply && (
        <form className="review-form" onSubmit={sendReply}>
          <label className="review-comment">
            Reply publicly (once)
            <textarea value={reply} maxLength={reviewCommentMaxLength} rows={3} onChange={(event) => setReply(event.target.value)} />
          </label>
          {error && <p className="studio-message error" role="alert">{error}</p>}
          <button className="button-quiet" type="submit" disabled={saving || reply.trim().length < 2}>Post reply</button>
        </form>
      )}
    </div>
  );
}
