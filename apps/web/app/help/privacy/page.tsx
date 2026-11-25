import { BottomNav, SiteHeader } from '../../../components/SiteChrome';
import { getFeatures } from '../../../lib/catalogue';
import PrivacyRequestClient from './PrivacyRequestClient';

export const metadata = { title: 'Personal data request | Katondo' };

export default async function PrivacyRequestPage() {
  const features = await getFeatures();
  return (
    <>
      <SiteHeader />
      <main className="shell help-page">
        {features.support
          ? <PrivacyRequestClient />
          : <p className="help-off">Personal data requests open once sign-in is switched on.</p>}
      </main>
      <BottomNav active="account" />
    </>
  );
}
