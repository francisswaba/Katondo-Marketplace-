import { BottomNav, SiteHeader } from '../../../../components/SiteChrome';
import { getFeatures } from '../../../../lib/catalogue';
import CaseClient from './CaseClient';

export const metadata = { title: 'Your request | Katondo', robots: { index: false } };

type Props = { params: Promise<{ reference: string }>; searchParams: Promise<{ new?: string }> };

export default async function CasePage({ params, searchParams }: Props) {
  const [{ reference }, query, features] = await Promise.all([params, searchParams, getFeatures()]);
  return (
    <>
      <SiteHeader />
      <main className="shell help-page">
        {features.support
          ? <CaseClient reference={reference} justOpened={query.new === '1'} />
          : <p className="help-off">Help requests open once sign-in is switched on.</p>}
      </main>
      <BottomNav active="account" />
    </>
  );
}
