import { BottomNav, SiteHeader } from '../../../components/SiteChrome';
import { getFeatures } from '../../../lib/catalogue';
import CheckStaffClient from './CheckStaffClient';

export const metadata = { title: 'Check a staff member | Katondo' };

export default async function CheckStaffPage() {
  const features = await getFeatures();
  return (
    <>
      <SiteHeader />
      <main className="shell help-page">
        {features.support
          ? <CheckStaffClient />
          : <p className="help-off">Staff checks open once sign-in is switched on.</p>}
      </main>
      <BottomNav active="account" />
    </>
  );
}
