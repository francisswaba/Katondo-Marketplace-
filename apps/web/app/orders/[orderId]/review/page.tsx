import { BottomNav, SiteHeader } from '../../../../components/SiteChrome';
import ReviewOrderClient from './ReviewOrderClient';

export const metadata = { title: 'Leave a review | Katondo', robots: { index: false } };

type Props = { params: Promise<{ orderId: string }> };

export default async function ReviewOrderPage({ params }: Props) {
  const { orderId } = await params;
  return (
    <>
      <SiteHeader />
      <main className="shell review-page">
        <ReviewOrderClient orderId={orderId} />
      </main>
      <BottomNav active="home" />
    </>
  );
}
