import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getProductType, type ListingResponse, type ShopReviewsResponse } from '@katondo/contracts';
import Screen from '../../components/Screen';
import { BrandMark, Stars, TypeArt, fetchJson, formatPrice, ratingLabel, rounded, useTheme, type Theme } from '../../components/kit';

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const s = styles(theme);
  const [data, setData] = useState<ListingResponse | null>(null);
  const [reviews, setReviews] = useState<ShopReviewsResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const listing = await fetchJson<ListingResponse>(`/api/listings/${encodeURIComponent(String(id))}`);
    setData(listing);
    setState(listing ? 'ready' : 'missing');
    const sellerId = listing?.listing.sellerId;
    setReviews(sellerId ? await fetchJson<ShopReviewsResponse>(`/api/shops/${sellerId}/reviews`) : null);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (state === 'loading') {
    return <Screen><View style={{ alignItems: 'center', marginTop: 80 }} accessibilityLabel="Loading listing"><BrandMark size={56} colour={theme.brand} live /></View></Screen>;
  }
  if (!data) {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Text style={s.title}>This listing isn’t available.</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>It may have sold or been removed, or your connection dropped. Pull down to try again.</Text>
      </Screen>
    );
  }

  const { listing, market } = data;
  const type = getProductType(listing.productType);
  const details = type.fields.filter((field) => listing.attributes[field.key]);
  const rating = reviews?.enabled && reviews.summary.count > 0 && reviews.summary.average !== null ? reviews.summary : null;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <TypeArt type={listing.productType} height={340} radius={28} />
      {listing.displayStyle === 'gallery' && (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {[0, 1, 2].map((index) => <View key={index} style={{ flex: 1 }}><TypeArt type={listing.productType} height={70} radius={14} /></View>)}
        </View>
      )}

      <Text style={s.category}>{listing.categoryName}</Text>
      <Text style={s.title} accessibilityRole="header">{listing.title}</Text>
      <Text style={s.price}>{formatPrice(listing.priceMinor, listing.currency, market.locale)}</Text>

      <View style={s.facts}>
        {[...details.map((field) => ({ label: field.label, value: listing.attributes[field.key] })),
          { label: 'Condition', value: listing.condition },
          { label: 'Available', value: String(listing.quantity) }].map((fact, index) => (
          <View key={fact.label} style={[s.fact, index % 2 === 1 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.line }]}>
            <Text style={s.muted}>{fact.label}</Text>
            <Text style={s.factValue}>{fact.value}</Text>
          </View>
        ))}
      </View>

      <View style={s.actions}>
        <View style={[s.buy, { opacity: 0.5 }]} accessibilityRole="button" accessibilityState={{ disabled: true }}>
          <Text style={s.buyText}>Buy now</Text>
        </View>
      </View>
      <Text style={[s.muted, { marginTop: 8 }]}>Checkout opens once payments are switched on for {market.countryName}.</Text>

      <Text style={s.subheading} accessibilityRole="header">About this item</Text>
      <Text style={s.body}>{listing.description}</Text>

      <Pressable
        accessibilityRole={listing.sellerId ? 'link' : undefined}
        accessibilityLabel={`${listing.sellerName}${rating ? `, ${ratingLabel(rating.average!, rating.count)}` : ''}${listing.sellerId ? ', visit shop' : ''}`}
        disabled={!listing.sellerId}
        onPress={() => listing.sellerId && router.push(`/shop/${listing.sellerId}`)}
        style={s.seller}
      >
        <View style={s.avatar}><Text style={s.avatarText}>{listing.sellerName.slice(0, 1)}</Text></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.sellerName}>{listing.sellerName}</Text>
          {rating && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Stars rating={rating.average!} size={13} theme={theme} />
              <Text style={s.ratingText}>{rating.average!.toFixed(1)} <Text style={s.muted}>({rating.count})</Text></Text>
            </View>
          )}
          {listing.sellerId && <Text style={s.link}>Visit shop</Text>}
        </View>
        {listing.sellerId && <Text style={{ color: theme.muted, fontSize: 24 }}>›</Text>}
      </Pressable>
    </Screen>
  );
}

const styles = (t: Theme) => StyleSheet.create({
  category: { color: t.brand, fontSize: 14, fontWeight: '600', marginTop: 22 },
  title: { color: t.ink, fontSize: 32, fontWeight: '800', letterSpacing: -1.1, lineHeight: 35, marginTop: 6 },
  price: { color: t.ink, fontSize: 30, fontWeight: '700', fontFamily: rounded, marginTop: 12 },
  muted: { color: t.muted, fontSize: 13 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20, borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, overflow: 'hidden' },
  fact: { width: '50%', padding: 14, gap: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, marginTop: -StyleSheet.hairlineWidth },
  factValue: { color: t.ink, fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  buy: { flex: 1, height: 52, borderRadius: 26, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' },
  buyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  subheading: { color: t.ink, fontSize: 19, fontWeight: '700', marginTop: 28 },
  body: { color: t.muted, fontSize: 16, lineHeight: 24, marginTop: 6 },
  seller: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 26, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface },
  avatar: { width: 46, height: 46, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomRightRadius: 16, borderBottomLeftRadius: 23, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sellerName: { color: t.ink, fontSize: 16, fontWeight: '700' },
  ratingText: { color: t.ink, fontSize: 13, fontWeight: '600', fontFamily: rounded },
  link: { color: t.brand, fontSize: 13, fontWeight: '600' },
});
