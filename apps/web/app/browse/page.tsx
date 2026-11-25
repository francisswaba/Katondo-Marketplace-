import { getProductType, productTypes } from '@katondo/contracts';
import ListingFeed from '../../components/ListingFeed';
import PatternArt from '../../components/PatternArt';
import { BottomNav, SiteFooter, SiteHeader } from '../../components/SiteChrome';
import { getCatalogue } from '../../lib/catalogue';
import { fallbackMarket } from '../../lib/market';

type Props = { searchParams: Promise<{ type?: string; q?: string }> };

export default async function BrowsePage({ searchParams }: Props) {
  const { type, q } = await searchParams;
  const selected = productTypes.some((item) => item.id === type) ? type : undefined;
  const query = (q ?? '').trim().toLowerCase();
  const catalogue = await getCatalogue(selected);
  const market = catalogue?.market ?? fallbackMarket();
  const listings = (catalogue?.listings ?? []).filter((listing) => !query
    || `${listing.title} ${listing.description} ${listing.categoryName} ${listing.sellerName} ${Object.values(listing.attributes).join(' ')}`.toLowerCase().includes(query));
  const heading = query ? `Results for “${q}”` : selected ? getProductType(selected).label : 'Everything for sale';

  return (
    <>
      <SiteHeader query={q} />
      <main className="shell">
        <div className="browse-head">
          <h1>{heading}</h1>
          <p>{listings.length} {listings.length === 1 ? 'listing' : 'listings'}</p>
        </div>
        <nav className="type-rail compact-rail" aria-label="Filter by type">
          <a className="type-chip" href={query ? `/browse?q=${encodeURIComponent(q ?? '')}` : '/browse'} aria-current={!selected ? 'page' : undefined}>All</a>
          {productTypes.map((item) => (
            <a key={item.id} className="type-chip" aria-current={selected === item.id ? 'page' : undefined}
              href={`/browse?type=${item.id}${query ? `&q=${encodeURIComponent(q ?? '')}` : ''}`}>
              <span className="type-swatch"><PatternArt type={item.id} label="" /></span>
              {item.label}
            </a>
          ))}
        </nav>
        <section className="section">
          {listings.length
            ? <ListingFeed listings={listings} locale={market.locale} />
            : (
              <div className="empty">
                <h3>Nothing here yet.</h3>
                <p>{query ? 'Try a shorter search, or check another type.' : 'Check another type, or come back soon.'}</p>
              </div>
            )}
        </section>
      </main>
      <SiteFooter countryName={market.countryName} />
      <BottomNav active="browse" />
    </>
  );
}
