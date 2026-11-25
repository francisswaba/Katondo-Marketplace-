import { BottomNav, SiteHeader } from '../../components/SiteChrome';
import { getFeatures } from '../../lib/catalogue';
import MessagesClient from './MessagesClient';

export const metadata = { title: 'Messages | Katondo', robots: { index: false } };

type Props = { searchParams: Promise<{ c?: string; listing?: string }> };

export default async function MessagesPage({ searchParams }: Props) {
  const [{ c, listing }, features] = await Promise.all([searchParams, getFeatures()]);
  return (
    <>
      <SiteHeader />
      <main className="shell messages-page">
        {features.messaging
          ? <MessagesClient conversationId={c ?? null} listingId={listing ?? null} />
          : (
            <div className="messages-off">
              <h1>Messages</h1>
              <p>Messaging between buyers and sellers opens once sign-in is switched on.</p>
            </div>
          )}
      </main>
      <BottomNav active="messages" />
    </>
  );
}
