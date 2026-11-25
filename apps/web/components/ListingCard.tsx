import { getProductType, type Listing } from '@katondo/contracts';
import PatternArt from './PatternArt';
import { formatMoney } from '../lib/market';

type CardProps = {
  listing: Listing;
  locale: string;
  /** When false the card is a static preview (used in the listing studio). */
  linked?: boolean;
};

function highlights(listing: Listing, limit: number) {
  return getProductType(listing.productType).fields
    .filter((field) => field.highlight && listing.attributes[field.key])
    .slice(0, limit)
    .map((field) => {
      const value = listing.attributes[field.key];
      // Bare numbers ("3", "1,200") need their label to make sense on a chip.
      const short = /^[\d.,\s]+$/.test(value) ? `${field.label.replace(/\s*\(.*\)$/, '')} ${value}` : value;
      return { label: field.label, value, short };
    });
}

function Wrapper({ listing, linked, className, children }: { listing: Listing; linked: boolean; className: string; children: React.ReactNode }) {
  if (!linked) return <div className={className}>{children}</div>;
  return <a className={className} href={`/listing/${listing.id}`}>{children}</a>;
}

export default function ListingCard({ listing, locale, linked = true }: CardProps) {
  const price = formatMoney(listing.priceMinor, listing.currency, locale);
  const image = listing.media.find((item) => item.type === 'image')?.url;
  const art = <PatternArt type={listing.productType} imageUrl={image} label={listing.title} />;
  const style = listing.displayStyle;

  if (style === 'compact') {
    const unit = listing.attributes.unit;
    return (
      <Wrapper listing={listing} linked={linked} className="card card-compact">
        <span className="card-art">{art}</span>
        <span className="card-body">
          <span className="card-title">{listing.title}</span>
          <span className="card-seller">{listing.sellerName}</span>
        </span>
        <span className="card-price">{price}{unit && <small>per {unit}</small>}</span>
      </Wrapper>
    );
  }

  if (style === 'spotlight') {
    return (
      <Wrapper listing={listing} linked={linked} className="card card-spotlight">
        <span className="card-art">{art}</span>
        <span className="card-body">
          <span className="card-kicker">{listing.categoryName}</span>
          <span className="card-title">{listing.title}</span>
          <span className="card-facts">
            {highlights(listing, 3).map((fact) => <span key={fact.label}>{fact.short}</span>)}
          </span>
          <span className="card-price">{price}</span>
          <span className="card-seller">{listing.sellerName}</span>
        </span>
      </Wrapper>
    );
  }

  if (style === 'video') {
    const hasVideo = listing.media.some((item) => item.type === 'video');
    return (
      <Wrapper listing={listing} linked={linked} className="card card-video">
        <span className="card-art">{art}</span>
        <span className="play-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7Z" fill="currentColor" /></svg></span>
        <span className="card-overlay">
          <span className="card-title">{listing.title}</span>
          <span className="card-price">{price}</span>
          <span className="card-seller">{hasVideo ? listing.sellerName : `${listing.sellerName}, video coming soon`}</span>
        </span>
      </Wrapper>
    );
  }

  if (style === 'spec') {
    const facts = highlights(listing, 4);
    return (
      <Wrapper listing={listing} linked={linked} className="card card-spec">
        <span className="card-art">{art}</span>
        <span className="card-body">
          <span className="card-title">{listing.title}</span>
          <dl className="spec-list">
            {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
            <div><dt>Condition</dt><dd>{listing.condition}</dd></div>
          </dl>
          <span className="card-price">{price}</span>
        </span>
      </Wrapper>
    );
  }

  if (style === 'gallery') {
    const extra = Math.max(listing.media.filter((item) => item.type === 'image').length - 1, 0);
    return (
      <Wrapper listing={listing} linked={linked} className="card card-gallery">
        <span className="card-art">{art}</span>
        <span className="thumb-strip" aria-hidden="true">
          <span className="thumb">{art}</span>
          <span className="thumb">{art}</span>
          <span className="thumb thumb-count">{extra ? `+${extra}` : 'More'}</span>
        </span>
        <span className="card-title">{listing.title}</span>
        <span className="card-row"><span className="card-seller">{listing.sellerName}</span><span className="card-price">{price}</span></span>
      </Wrapper>
    );
  }

  return (
    <Wrapper listing={listing} linked={linked} className="card card-classic">
      <span className="card-art">{art}{listing.condition !== 'new' && <span className="condition-tag">{listing.condition}</span>}</span>
      <span className="card-title">{listing.title}</span>
      <span className="card-row"><span className="card-seller">{listing.sellerName}</span><span className="card-price">{price}</span></span>
    </Wrapper>
  );
}
