import { SiteFooter, SiteHeader } from '../../components/SiteChrome';
import { LegalDocument, readLegalDocument } from '../../lib/legal';
import { fallbackMarket } from '../../lib/market';

export const dynamic = 'force-static';
export const metadata = { title: 'Privacy notice | Katondo' };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell legal-page">
        <LegalDocument source={readLegalDocument('PRIVACY_NOTICE.md')} />
      </main>
      <SiteFooter countryName={fallbackMarket().countryName} />
    </>
  );
}
