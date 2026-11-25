import { BottomNav, SiteHeader } from '../../../components/SiteChrome';
import { getFeatures } from '../../../lib/catalogue';
import NewCaseClient from './NewCaseClient';

export const metadata = { title: 'New request | Katondo', robots: { index: false } };

type Props = { searchParams: Promise<{ category?: string; subject?: string; label?: string }> };

export default async function NewCasePage({ searchParams }: Props) {
  const [params, features] = await Promise.all([searchParams, getFeatures()]);
  return (
    <>
      <SiteHeader />
      <main className="shell help-page">
        {features.support
          ? <NewCaseClient category={params.category ?? null} subjectId={params.subject ?? null} subjectLabel={params.label?.slice(0, 160) ?? null} />
          : <p className="help-off">Help requests open once sign-in is switched on.</p>}
      </main>
      <BottomNav active="account" />
    </>
  );
}
