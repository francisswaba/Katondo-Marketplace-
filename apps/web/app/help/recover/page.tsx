import { BottomNav, SiteHeader } from '../../../components/SiteChrome';
import { getFeatures } from '../../../lib/catalogue';
import RecoverAccountClient from './RecoverAccountClient';

export const metadata = { title: 'Recover your account | Katondo' };

export default async function RecoverAccountPage() {
  const features = await getFeatures();
  return (
    <>
      <SiteHeader />
      <main className="shell help-page">
        {features.support
          ? <RecoverAccountClient />
          : <p className="help-off">Account recovery opens once sign-in is switched on.</p>}
      </main>
      <BottomNav active="account" />
    </>
  );
}
