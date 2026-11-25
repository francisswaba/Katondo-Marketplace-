import { productTypes } from '@katondo/contracts';
import ListingFeed from '../components/ListingFeed';
import PatternArt from '../components/PatternArt';
import { BottomNav, SiteFooter, SiteHeader } from '../components/SiteChrome';
import { getCatalogue } from '../lib/catalogue';
import { fallbackMarket } from '../lib/market';

export default async function Home() {
  const catalogue = await getCatalogue();
  const market = catalogue?.market ?? fallbackMarket();
  const listings = catalogue?.listings ?? [];

  return (
    <>
      <SiteHeader />
      <main className="shell home">
        <section className="hero">
          <div className="hero-copy">
            <h1>Buy and sell anything in {market.countryName}.</h1>
            <p>Phones and cars, chitenge and kapenta, from people and shops you can check before you pay.</p>
            <form className="hero-search" action="/browse" role="search">
              <label className="visually-hidden" htmlFor="hero-search">What are you looking for?</label>
              <input id="hero-search" name="q" placeholder="What are you looking for?" />
              <button type="submit">Search</button>
            </form>
          </div>
          <div className="hero-art" aria-hidden="true">
            <span className="hero-tile tile-a"><PatternArt type="vehicles" label="" /></span>
            <span className="hero-tile tile-b"><PatternArt type="fashion" label="" /></span>
            <span className="hero-tile tile-c"><PatternArt type="food" label="" /></span>
            <span className="hero-tile tile-d"><PatternArt type="handmade" label="" /></span>
          </div>
        </section>

        <nav className="type-rail" aria-label="Shop by type">
          {productTypes.map((type) => (
            <a key={type.id} href={`/browse?type=${type.id}`} className="type-chip">
              <span className="type-swatch"><PatternArt type={type.id} label="" /></span>
              {type.label}
            </a>
          ))}
        </nav>

        <aside className="live-strip">
          <span className="live-dot" aria-hidden="true" />
          <p><strong>Live auctions are on the way.</strong> Bid on items while sellers show them on camera.</p>
        </aside>

        <section className="section" aria-labelledby="newest">
          <div className="section-head">
            <h2 id="newest">Newest listings</h2>
            <a href="/browse">See all</a>
          </div>
          {listings.length
            ? <ListingFeed listings={listings} locale={market.locale} />
            : (
              <div className="empty">
                <h3>{catalogue ? 'No listings yet.' : 'Listings couldn’t load.'}</h3>
                <p>{catalogue ? 'Be the first to sell something here.' : 'Check your connection and refresh the page.'}</p>
                {catalogue && <a className="button-primary" href="/sell/studio">Sell an item</a>}
              </div>
            )}
        </section>

        <section className="sell-band">
          <div>
            <h2>Your item, shown your way.</h2>
            <p>Pick what you’re selling, then choose how buyers see it: a big photo, a spotlight card, a video, or the key details up front.</p>
            <a className="button-light" href="/sell/studio">Open the listing studio</a>
          </div>
          <ul className="style-stack" aria-label="Display styles">
            <li className="mini mini-spotlight"><PatternArt type="property" label="" /><span>Spotlight</span></li>
            <li className="mini mini-video"><PatternArt type="handmade" label="" /><span>Video first</span></li>
            <li className="mini mini-spec"><PatternArt type="electronics" label="" /><span>Key details</span></li>
          </ul>
        </section>
      </main>
      <SiteFooter countryName={market.countryName} />
      <BottomNav active="home" />
    </>
  );
}
