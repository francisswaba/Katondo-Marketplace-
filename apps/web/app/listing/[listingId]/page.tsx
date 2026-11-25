import { notFound } from 'next/navigation';
import { getDisplayStyle, getProductType } from '@katondo/contracts';
import PatternArt from '../../../components/PatternArt';
import Stars, { ratingLabel } from '../../../components/Stars';
import { BottomNav, SiteFooter, SiteHeader } from '../../../components/SiteChrome';
import { getListing, getShopReviews } from '../../../lib/catalogue';
import { formatMoney } from '../../../lib/market';

// Serve a cached copy and refresh it in the background at most once a minute.
export const revalidate = 60;

// No pages are built ahead of time; each one is cached the first time someone opens it.
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ listingId: string }> };

export async function generateMetadata({ params }: Props) {
  const { listingId } = await params;
  const data = await getListing(listingId);
  return { title: data ? `${data.listing.title} | Katondo` : 'Listing | Katondo' };
}

export default async function ListingPage({ params }: Props) {
  const { listingId } = await params;
  const data = await getListing(listingId);
  if (!data) notFound();
  const { listing, market } = data;
  const reviews = listing.sellerId ? await getShopReviews(listing.sellerId) : null;
  const rating = reviews?.enabled && reviews.summary.count > 0 && reviews.summary.average !== null ? reviews.summary : null;
  const type = getProductType(listing.productType);
  const style = getDisplayStyle(listing.displayStyle).id;
  const images = listing.media.filter((item) => item.type === 'image');
  const video = listing.media.find((item) => item.type === 'video');
  const facts = type.fields.filter((field) => listing.attributes[field.key]);

  return (
    <>
      <SiteHeader />
      <main className={`shell detail detail-${style}`}>
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/browse">Browse</a>
          <span aria-hidden="true">/</span>
          <a href={`/browse?type=${type.id}`}>{type.label}</a>
        </nav>

        <div className="detail-media">
          {style === 'video' && video
            ? <video src={video.url} controls playsInline poster={images[0]?.url} />
            : <PatternArt type={listing.productType} imageUrl={images[0]?.url} label={listing.title} />}
          {style === 'gallery' && (
            <div className="detail-thumbs">
              {(images.length > 1 ? images.slice(1, 5) : [null, null, null]).map((image, index) => (
                <span key={image?.url ?? index}><PatternArt type={listing.productType} imageUrl={image?.url} label={`${listing.title}, photo ${index + 2}`} /></span>
              ))}
            </div>
          )}
        </div>

        <div className="detail-info">
          <p className="detail-category">{listing.categoryName}</p>
          <h1>{listing.title}</h1>
          <p className="detail-price">{formatMoney(listing.priceMinor, listing.currency, market.locale)}</p>

          {facts.length > 0 && (
            <dl className="detail-facts">
              {facts.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{listing.attributes[field.key]}</dd></div>)}
              <div><dt>Condition</dt><dd>{listing.condition}</dd></div>
              <div><dt>Available</dt><dd>{listing.quantity}</dd></div>
            </dl>
          )}

          <div className="detail-actions">
            <button className="button-primary" type="button" disabled>Buy now</button>
            <button className="button-quiet" type="button" disabled>Save</button>
          </div>
          <p className="detail-note">Checkout opens once payments are switched on for {market.countryName}.</p>

          <h2>About this item</h2>
          <p className="detail-description">{listing.description}</p>

          <a className="seller-row" href={listing.sellerId ? `/shop/${listing.sellerId}` : undefined}>
            <span className="seller-avatar" aria-hidden="true">{listing.sellerName.slice(0, 1)}</span>
            <span>
              <strong>{listing.sellerName}</strong>
              {rating && (
                <span className="seller-rating" aria-label={ratingLabel(rating.average!, rating.count)}>
                  <Stars rating={rating.average!} size={14} /> {rating.average!.toFixed(1)} <span>({rating.count})</span>
                </span>
              )}
              <small>{listing.sellerId ? 'Visit shop' : 'Seller'}</small>
            </span>
          </a>
        </div>
      </main>
      <SiteFooter countryName={market.countryName} />
      <BottomNav active="browse" />
    </>
  );
}
