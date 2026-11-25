import { StyleSheet, Text, View } from 'react-native';
import type { ShopReviewsResponse } from '@katondo/contracts';
import { Stars, ratingLabel, rounded, type Theme } from './kit';

/** A shop's rating breakdown and buyer reviews. Renders nothing while reviews are switched off. */
export default function ShopReviews({ data, shopName, locale, theme }: { data: ShopReviewsResponse | null; shopName: string; locale: string; theme: Theme }) {
  if (!data?.enabled) return null;
  const s = styles(theme);
  const { summary, reviews } = data;

  return (
    <View style={s.section}>
      <Text style={s.heading} accessibilityRole="header">Reviews</Text>
      {summary.count === 0 || summary.average === null ? (
        <Text style={s.muted}>No reviews yet. Buyers can review {shopName} after a completed order.</Text>
      ) : (
        <>
          <View style={s.summary} accessible accessibilityLabel={ratingLabel(summary.average, summary.count)}>
            <View>
              <Text style={s.average}>{summary.average.toFixed(1)}</Text>
              <Stars rating={summary.average} size={16} theme={theme} />
              <Text style={[s.muted, { marginTop: 6 }]}>{summary.count} {summary.count === 1 ? 'review' : 'reviews'}</Text>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = summary.distribution[star - 1];
                return (
                  <View key={star} style={s.barRow}>
                    <Text style={[s.muted, { width: 14 }]}>{star}</Text>
                    <View style={s.bar}><View style={[s.barFill, { width: `${(count / summary.count) * 100}%` }]} /></View>
                    <Text style={[s.muted, { width: 22, textAlign: 'right' }]}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
          {reviews.map((review) => (
            <View key={review.id} style={s.review}>
              <View style={s.meta} accessible accessibilityLabel={`${review.rating} out of 5 stars, ${new Date(review.createdAt).toLocaleDateString(locale)}`}>
                <Stars rating={review.rating} theme={theme} />
                <Text style={s.muted}>{new Date(review.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
              <Text style={[s.muted, { marginTop: 6 }]}>Bought {review.listingTitle}</Text>
              {review.comment ? <Text style={s.text}>{review.comment}</Text> : null}
              {review.reply ? (
                <View style={s.reply}>
                  <Text style={s.replyTitle}>Reply from {shopName}</Text>
                  <Text style={s.text}>{review.reply}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = (t: Theme) => StyleSheet.create({
  section: { marginTop: 32, paddingTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
  heading: { color: t.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, marginBottom: 16 },
  muted: { color: t.muted, fontSize: 13 },
  summary: { flexDirection: 'row', gap: 22, alignItems: 'center', padding: 18, borderRadius: 24, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, marginBottom: 8 },
  average: { color: t.ink, fontSize: 48, fontWeight: '800', fontFamily: rounded, letterSpacing: -1, lineHeight: 52 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { flex: 1, height: 7, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: t.brand },
  review: { paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { color: t.ink, fontSize: 15, lineHeight: 22, marginTop: 6 },
  reply: { marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line },
  replyTitle: { color: t.ink, fontSize: 13, fontWeight: '700' },
});
