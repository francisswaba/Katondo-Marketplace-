import ListingStudio from './ListingStudio';
import { BottomNav, SiteHeader } from '../../../components/SiteChrome';
import { getCatalogue } from '../../../lib/catalogue';
import { fallbackMarket } from '../../../lib/market';

export const metadata = { title: 'Listing studio | Katondo' };

export default async function StudioPage() {
  const catalogue = await getCatalogue();
  const market = catalogue?.market ?? fallbackMarket();
  return (
    <>
      <SiteHeader />
      <main className="shell studio-page">
        <div className="studio-head">
          <h1>Listing studio</h1>
          <p>Choose what you’re selling and how it appears. The preview updates as you go.</p>
        </div>
        <ListingStudio market={market} categories={catalogue?.categories ?? []} />
      </main>
      <BottomNav active="sell" />
    </>
  );
}
