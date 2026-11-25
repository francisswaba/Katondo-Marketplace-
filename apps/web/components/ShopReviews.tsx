import type { ShopReviewsResponse } from '@katondo/contracts';
import Stars, { ratingLabel } from './Stars';

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A shop's rating breakdown and its buyer reviews. Renders nothing while reviews are switched off. */
export default function ShopReviews({ data, shopName, locale, canReport = false }: { data: ShopReviewsResponse | null; shopName: string; locale: string; canReport?: boolean }) {
  if (!data?.enabled) return null;
  const { summary, reviews } = data;

  return (
    <section className="reviews" aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Reviews</h2>
      {summary.count === 0 || summary.average === null ? (
        <p className="reviews-none">No reviews yet. Buyers can review {shopName} after a completed order.</p>
      ) : (
        <div className="reviews-layout">
          <div className="reviews-summary">
            <p className="reviews-average"><span>{summary.average.toFixed(1)}</span> out of 5</p>
            <Stars rating={summary.average} size={20} />
            <p className="visually-hidden">{ratingLabel(summary.average, summary.count)}</p>
            <p className="reviews-count">{summary.count} {summary.count === 1 ? 'review' : 'reviews'} from completed orders</p>
            <dl className="reviews-bars">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = summary.distribution[star - 1];
                return (
                  <div key={star}>
                    <dt>{star} star{star === 1 ? '' : 's'}</dt>
                    <dd>
                      <span className="bar" aria-hidden="true"><span style={{ width: `${(count / summary.count) * 100}%` }} /></span>
                      <span className="bar-count">{count}</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <ol className="shop-review-list">
            {reviews.map((review) => (
              <li key={review.id}>
                <div className="review-meta">
                  <Stars rating={review.rating} />
                  <span className="visually-hidden">{review.rating} out of 5 stars</span>
                  <time dateTime={review.createdAt}>{formatDate(review.createdAt, locale)}</time>
                </div>
                <p className="review-item">Bought {review.listingTitle}</p>
                {review.comment && <p className="review-text">{review.comment}</p>}
                {review.reply && (
                  <div className="review-reply">
                    <strong>Reply from {shopName}</strong>
                    <p>{review.reply}</p>
                  </div>
                )}
                {canReport && (
                  <a className="report-link" href={`/help/new?category=report_review&subject=${review.id}&label=${encodeURIComponent(`Review on ${review.listingTitle}`)}`}>Report review</a>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
