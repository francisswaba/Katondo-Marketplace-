import type { CatalogueResponse } from '@katondo/contracts';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function getCatalogue(): Promise<CatalogueResponse | null> {
  try {
    const response = await fetch(`${apiUrl}/api/catalogue`, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as CatalogueResponse;
  } catch {
    return null;
  }
}

function formatPrice(priceMinor: number, currency: string) {
  return new Intl.NumberFormat('en-ZM', { style: 'currency', currency }).format(priceMinor / 100);
}

export default async function Home() {
  const catalogue = await getCatalogue();

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/">katondo<span>.</span></a>
        <nav aria-label="Main navigation">
          <a href="#categories">Categories</a>
          <a href="#listings">Explore</a>
          <a className="sell-link" href="/sell">Start selling <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> YOUR MARKETPLACE, REIMAGINED</p>
          <h1>Good things<br />find <em>new homes.</em></h1>
          <p className="hero-description">Discover one-of-a-kind finds from people and businesses across Zambia.</p>
          <a className="primary-button" href="#listings">Explore the marketplace <span aria-hidden="true">→</span></a>
        </div>
        <div className="hero-art" aria-label="Illustration of a curated marketplace">
          <div className="sun-disc" />
          <div className="art-card card-back"><span>LOCAL FINDS</span><b>Made to<br />be found.</b></div>
          <div className="art-card card-front"><span className="product-orbit">✳</span><span className="art-caption">A little more<br />you.</span></div>
          <div className="art-stamp">SHOP<br />ZAMBIA</div>
        </div>
      </section>

      <section className="category-section" id="categories">
        <div className="section-heading"><div><p className="eyebrow">A WORLD OF GOOD FINDS</p><h2>Browse by category</h2></div><span className="section-mark">01 / 03</span></div>
        <div className="category-row">
          {(catalogue?.categories ?? []).map((category, index) => (
            <a className="category-chip" href={`#${category.slug}`} key={category.id}><span className={`category-icon icon-${index % 4}`}>{['✳', '⌂', '◒', '↗'][index % 4]}</span>{category.name}<span className="chip-arrow">↗</span></a>
          ))}
          {!catalogue && <p className="empty-state">Start the API and database to load categories.</p>}
        </div>
      </section>

      <section className="listing-section" id="listings">
        <div className="section-heading"><div><p className="eyebrow">THE GOOD STUFF</p><h2>Picked for you</h2></div><a className="text-link" href="#listings">View everything <span aria-hidden="true">↗</span></a></div>
        {catalogue?.listings.length ? <div className="listing-grid">
          {catalogue.listings.map((listing, index) => (
            <article className="listing-card" key={listing.id}>
              <div className={`listing-image image-${index % 4}`}><span className="image-label">{listing.condition}</span><span className="image-glyph">{['◈', '◌', '✳', '⌂'][index % 4]}</span><button className="save-button" aria-label={`Save ${listing.title}`}>♡</button></div>
              <p className="listing-category">{listing.categoryName}</p><h3>{listing.title}</h3><div className="listing-meta"><span>{listing.sellerName}</span><strong>{formatPrice(listing.priceMinor, listing.currency)}</strong></div>
            </article>
          ))}
        </div> : <div className="catalogue-empty"><div className="empty-symbol">✳</div><h3>Your next great find is around the corner.</h3><p>{catalogue ? 'New listings will appear here.' : 'Connect the local API and database to see the starter catalogue.'}</p></div>}
      </section>

      <footer><a className="wordmark" href="/">katondo<span>.</span></a><p>Good finds. Good people. Right here.</p><span>Made for Zambia&nbsp; ✳</span></footer>
    </main>
  );
}
