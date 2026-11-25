import { notFound } from 'next/navigation';
import ListingCard from '../../../components/ListingCard';
import ListingFeed from '../../../components/ListingFeed';
import ShopReviews from '../../../components/ShopReviews';
import Stars, { ratingLabel } from '../../../components/Stars';
import { BottomNav, SiteFooter, SiteHeader } from '../../../components/SiteChrome';
import { getFeatures, getShopReviews, getStorefront } from '../../../lib/catalogue';
import { formatMoney } from '../../../lib/market';

// Serve a cached copy and refresh it in the background at most once a minute.
export const revalidate = 60;

// No pages are built ahead of time; each one is cached the first time someone opens it.
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ sellerId: string }> };

export default async function ShopPage({ params }: Props) {
  const { sellerId } = await params;
  const [data, reviews, features] = await Promise.all([getStorefront(sellerId), getShopReviews(sellerId), getFeatures()]);
  if (!data) notFound();
  const rating = reviews?.enabled && reviews.summary.count > 0 && reviews.summary.average !== null ? reviews.summary : null;
  const { storefront, listings, market } = data;
  const [feature, ...others] = listings;

  return (
    <>
      <SiteHeader />
      <main className="shell shop">
        <header className="shop-head">
          <span className="shop-avatar" aria-hidden="true">{storefront.displayName.slice(0, 1)}</span>
          <div>
            <h1>{storefront.displayName}</h1>
            <p>{storefront.tagline || (storefront.sellerType === 'business' ? 'Registered business' : 'Independent seller')}</p>
            {rating && (
              <a className="shop-rating" href="#reviews-heading" aria-label={ratingLabel(rating.average!, rating.count)}>
                <Stars rating={rating.average!} /> <strong>{rating.average!.toFixed(1)}</strong> <span>({rating.count})</span>
              </a>
            )}
          </div>
          {storefront.verificationStatus === 'verified' && <span className="verified-badge">Verified seller</span>}
        </header>

        {!listings.length && <div className="empty"><h3>No listings right now.</h3><p>This shop hasn’t listed anything yet.</p></div>}

        {listings.length > 0 && storefront.layout === 'editorial' && (
          <>
            <div className="shop-feature"><ListingCard listing={{ ...feature, displayStyle: 'spotlight' }} locale={market.locale} /></div>
            {others.length > 0 && <ListingFeed listings={others} locale={market.locale} />}
          </>
        )}

        {listings.length > 0 && storefront.layout === 'list' && (
          <ul className="shop-list">
            {listings.map((listing) => (
              <li key={listing.id}>
                <ListingCard listing={{ ...listing, displayStyle: 'spec' }} locale={market.locale} />
              </li>
            ))}
          </ul>
        )}

        {listings.length > 0 && storefront.layout === 'grid' && (
          <div className="shop-grid">
            {listings.map((listing) => <ListingCard key={listing.id} listing={{ ...listing, displayStyle: 'classic' }} locale={market.locale} />)}
          </div>
        )}

        {listings.length > 0 && (
          <p className="shop-summary">{listings.length} listings from {formatMoney(Math.min(...listings.map((item) => item.priceMinor)), market.currency, market.locale)}</p>
        )}

        <ShopReviews data={reviews} shopName={storefront.displayName} locale={market.locale} canReport={features.support} />

        {features.support && (
          <a className="report-link" href={`/help/new?category=report_shop&subject=${sellerId}&label=${encodeURIComponent(storefront.displayName)}`}>Report this shop</a>
        )}
      </main>
      <SiteFooter countryName={market.countryName} />
      <BottomNav active="browse" />
    </>
  );
}
