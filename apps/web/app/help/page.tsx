import { BottomNav, SiteFooter, SiteHeader } from '../../components/SiteChrome';
import { getCatalogue, getFeatures } from '../../lib/catalogue';
import { fallbackMarket } from '../../lib/market';
import HelpHome from './HelpHome';

export const metadata = { title: 'Help and complaints | Katondo' };

export default async function HelpPage() {
  const [features, catalogue] = await Promise.all([getFeatures(), getCatalogue()]);
  const market = catalogue?.market ?? fallbackMarket();
  return (
    <>
      <SiteHeader />
      <main className="shell help-page">
        <div className="help-head">
          <h1>Help and complaints</h1>
          <p>Tell us what went wrong. Every request gets a reference number, a reply from a person, and a clear decision you can ask us to look at again.</p>
        </div>
        {features.support
          ? <HelpHome />
          : <p className="help-off">Help requests open once sign-in is switched on.</p>}
      </main>
      <SiteFooter countryName={market.countryName} />
      <BottomNav active="account" />
    </>
  );
}
