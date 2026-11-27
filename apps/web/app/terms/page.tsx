import { SiteFooter, SiteHeader } from '../../components/SiteChrome';
import { LegalDocument, readLegalDocument } from '../../lib/legal';
import { fallbackMarket } from '../../lib/market';

export const dynamic = 'force-static';
export const metadata = { title: 'Terms of use | Katondo' };

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell legal-page">
        <LegalDocument source={readLegalDocument('TERMS_OF_USE.md')} />
      </main>
      <SiteFooter countryName={fallbackMarket().countryName} />
    </>
  );
}
