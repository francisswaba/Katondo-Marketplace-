import type { Listing } from '@katondo/contracts';
import ListingCard from './ListingCard';

/**
 * Lays out a mixed feed. Each card keeps the style its seller chose:
 * spotlight cards span two columns, video cards run tall, and quick-list
 * items gather into one list so they don't scatter through the grid.
 */
export default function ListingFeed({ listings, locale }: { listings: Listing[]; locale: string }) {
  const quick = listings.filter((listing) => listing.displayStyle === 'compact');
  const rest = listings.filter((listing) => listing.displayStyle !== 'compact');

  return (
    <div className="feed">
      {rest.map((listing) => <ListingCard key={listing.id} listing={listing} locale={locale} />)}
      {quick.length > 0 && (
        <section className="quick-list" aria-labelledby="quick-list-title">
          <h3 id="quick-list-title">Everyday buys</h3>
          {quick.map((listing) => <ListingCard key={listing.id} listing={listing} locale={locale} />)}
        </section>
      )}
    </div>
  );
}
