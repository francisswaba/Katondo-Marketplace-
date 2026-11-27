import { SiteFooter, SiteHeader } from '../../components/SiteChrome';
import { LegalDocument, readLegalDocument } from '../../lib/legal';
import { fallbackMarket } from '../../lib/market';

export const dynamic = 'force-static';
export const metadata = { title: 'Seller terms | Katondo' };

export default function SellerTermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell legal-page">
        <LegalDocument source={readLegalDocument('SELLER_TERMS.md')} />
      </main>
      <SiteFooter countryName={fallbackMarket().countryName} />
    </>
  );
}
