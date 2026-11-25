'use client';

import { useEffect, useState } from 'react';

type AdminReview = {
  id: string;
  order_id: string;
  author_role: 'buyer' | 'seller';
  rating: number;
  comment: string | null;
  reply: string | null;
  status: 'active' | 'hidden';
  hidden_reason: string | null;
  created_at: string;
  listing_title: string;
  seller_name: string;
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'The request could not be completed.';
}

export default function ReviewModerationPanel({ token, canModerate }: { token: string; canModerate: boolean }) {
  const [status, setStatus] = useState<'active' | 'hidden'>('active');
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`${apiUrl}/api/admin/reviews?status=${status}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<{ enabled: boolean; reviews: AdminReview[] }>;
      })
      .then((payload) => { if (active) { setReviews(payload.reviews); setEnabled(payload.enabled); } })
      .catch((error: Error) => active && setMessage(error.message));
    return () => { active = false; };
  }, [token, status]);

  async function moderate(review: AdminReview) {
    const reason = reasons[review.id]?.trim() || '';
    if (reason.length < 3) {
      setMessage('Add a reason of at least three characters. It is kept in the audit history.');
      return;
    }
    const action = review.status === 'active' ? 'hide' : 'restore';
    setSaving(review.id);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/admin/reviews/${review.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setReviews((current) => current.filter((item) => item.id !== review.id));
      setMessage(action === 'hide' ? 'Review hidden. Buyers and sellers no longer see it.' : 'Review restored.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="admin-section">
      <div className="admin-section-title">
        <div><p className="eyebrow">Trust and safety</p><h2>Reviews</h2></div>
        <span>{enabled ? 'Open to buyers and sellers' : 'Switched off until checkout opens'}</span>
      </div>
      <div className="review-actions" style={{ marginTop: 0, marginBottom: 18, gridTemplateColumns: 'auto' }}>
        <div>
          <button type="button" aria-pressed={status === 'active'} onClick={() => setStatus('active')}>Visible</button>
          <button type="button" aria-pressed={status === 'hidden'} onClick={() => setStatus('hidden')}>Hidden</button>
        </div>
      </div>
      {message && <p className="admin-notice">{message}</p>}
      <div className="application-table">
        {reviews.map((review) => (
          <article className="review-card" key={review.id}>
            <div className="review-card-head">
              <div>
                <span>{review.author_role === 'buyer' ? `Buyer reviewing ${review.seller_name}` : `${review.seller_name} reviewing their buyer`}</span>
                <h3>{review.rating} out of 5 · {review.listing_title}</h3>
                <p>{new Date(review.created_at).toLocaleString('en-ZM')}</p>
              </div>
              <strong>{review.status === 'active' ? 'Visible' : 'Hidden'}</strong>
            </div>
            {review.comment && <p className="section-copy" style={{ margin: '14px 0 0', whiteSpace: 'pre-line' }}>{review.comment}</p>}
            {review.reply && <p className="section-copy" style={{ margin: '10px 0 0' }}><strong>Seller reply:</strong> {review.reply}</p>}
            {review.hidden_reason && <p className="section-copy" style={{ margin: '10px 0 0' }}><strong>Hidden because:</strong> {review.hidden_reason}</p>}
            {canModerate && (
              <div className="review-actions">
                <label>{review.status === 'active' ? 'Reason for hiding' : 'Reason for restoring'}
                  <textarea value={reasons[review.id] || ''} maxLength={500} onChange={(event) => setReasons((current) => ({ ...current, [review.id]: event.target.value }))} />
                </label>
                <div>
                  <button className={review.status === 'active' ? 'danger-button' : undefined} type="button" disabled={saving === review.id} onClick={() => moderate(review)}>
                    {review.status === 'active' ? 'Hide review' : 'Restore review'}
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
        {reviews.length === 0 && <div className="admin-empty">{status === 'active' ? 'No reviews yet.' : 'No hidden reviews.'}</div>}
      </div>
    </section>
  );
}
