/** Five stars filled to the rating (supports halves). Decorative: pair it with text. */
export default function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  const path = 'M12 2.6l2.83 5.74 6.33.92-4.58 4.47 1.08 6.3L12 17.05l-5.66 2.98 1.08-6.3L2.84 9.26l6.33-.92z';
  return (
    <span className="stars" aria-hidden="true" style={{ height: size }}>
      {[0, 1, 2, 3, 4].map((index) => {
        // Round to the nearest half star so partial stars read clearly at small sizes.
        const fill = Math.max(0, Math.min(1, Math.round(rating * 2) / 2 - index));
        return (
          <svg key={index} width={size} height={size} viewBox="0 0 24 24">
            <path d={path} className="star-empty" />
            {fill > 0 && (
              <path d={path} className="star-full" style={fill < 1 ? { clipPath: `inset(0 ${100 - fill * 100}% 0 0)` } : undefined} />
            )}
          </svg>
        );
      })}
    </span>
  );
}

export function ratingLabel(average: number, count: number) {
  return `Rated ${average.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`;
}
