import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ShopReviewsResponse, StorefrontResponse } from '@katondo/contracts';
import ListingTile from '../../components/ListingTile';
import Screen from '../../components/Screen';
import ShopReviews from '../../components/ShopReviews';
import { BrandMark, Stars, TypeArt, fetchJson, formatPrice, ratingLabel, rounded, useTheme, type Theme } from '../../components/kit';

export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const s = styles(theme);
  const [data, setData] = useState<StorefrontResponse | null>(null);
  const [reviews, setReviews] = useState<ShopReviewsResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const shopId = encodeURIComponent(String(id));
    const [shop, shopReviews] = await Promise.all([
      fetchJson<StorefrontResponse>(`/api/shops/${shopId}`),
      fetchJson<ShopReviewsResponse>(`/api/shops/${shopId}/reviews`),
    ]);
    setData(shop);
    setReviews(shopReviews);
    setState(shop ? 'ready' : 'missing');
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (state === 'loading') {
    return <Screen><View style={{ alignItems: 'center', marginTop: 80 }} accessibilityLabel="Loading shop"><BrandMark size={56} colour={theme.brand} live /></View></Screen>;
  }
  if (!data) {
    return (
      <Screen onRefresh={refresh} refreshing={refreshing}>
        <Text style={s.name}>This shop isn’t available.</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>It may be closed, or your connection dropped. Pull down to try again.</Text>
      </Screen>
    );
  }

  const { storefront, listings, market } = data;
  const rating = reviews?.enabled && reviews.summary.count > 0 && reviews.summary.average !== null ? reviews.summary : null;
  const [feature, ...others] = listings;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <View style={s.head}>
        <View style={s.avatar}><Text style={s.avatarText}>{storefront.displayName.slice(0, 1)}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} accessibilityRole="header">{storefront.displayName}</Text>
          <Text style={s.muted}>{storefront.tagline || (storefront.sellerType === 'business' ? 'Registered business' : 'Independent seller')}</Text>
          {rating && (
            <View style={s.ratingRow} accessible accessibilityLabel={ratingLabel(rating.average!, rating.count)}>
              <Stars rating={rating.average!} theme={theme} />
              <Text style={s.ratingText}>{rating.average!.toFixed(1)} <Text style={s.muted}>({rating.count})</Text></Text>
            </View>
          )}
        </View>
      </View>
      {storefront.verificationStatus === 'verified' && <Text style={s.verified}>Verified seller</Text>}

      {!listings.length && <Text style={[s.muted, { marginTop: 24 }]}>This shop hasn’t listed anything yet.</Text>}

      {listings.length > 0 && storefront.layout === 'list' && (
        <View style={{ gap: 12, marginTop: 22 }}>
          {listings.map((listing) => <ListingTile key={listing.id} listing={{ ...listing, displayStyle: 'spec' }} locale={market.locale} theme={theme} />)}
        </View>
      )}

      {listings.length > 0 && storefront.layout === 'editorial' && (
        <View style={{ marginTop: 22, gap: 22 }}>
          <ListingTile listing={{ ...feature, displayStyle: 'spotlight' }} locale={market.locale} theme={theme} />
          {others.length > 0 && (
            <View style={s.grid}>
              {others.map((listing) => (
                listing.displayStyle === 'compact'
                  ? (
                    <Pressable key={listing.id} accessibilityRole="link" onPress={() => router.push(`/listing/${listing.id}`)} style={s.compact}>
                      <View style={{ width: 48 }}><TypeArt type={listing.productType} height={48} radius={12} /></View>
                      <Text style={[s.compactTitle, { flex: 1 }]} numberOfLines={1}>{listing.title}</Text>
                      <Text style={s.ratingText}>{formatPrice(listing.priceMinor, listing.currency, market.locale)}</Text>
                    </Pressable>
                  )
                  : <ListingTile key={listing.id} listing={listing} locale={market.locale} theme={theme} />
              ))}
            </View>
          )}
        </View>
      )}

      {listings.length > 0 && storefront.layout === 'grid' && (
        <View style={[s.grid, { marginTop: 22 }]}>
          {listings.map((listing) => <ListingTile key={listing.id} listing={{ ...listing, displayStyle: 'classic' }} locale={market.locale} theme={theme} />)}
        </View>
      )}

      {listings.length > 0 && (
        <Text style={[s.muted, { marginTop: 20 }]}>
          {listings.length} {listings.length === 1 ? 'listing' : 'listings'} from {formatPrice(Math.min(...listings.map((item) => item.priceMinor)), market.currency, market.locale)}
        </Text>
      )}

      <ShopReviews data={reviews} shopName={storefront.displayName} locale={market.locale} theme={theme} />
    </Screen>
  );
}

const styles = (t: Theme) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  avatar: { width: 68, height: 68, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomRightRadius: 22, borderBottomLeftRadius: 34, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  name: { color: t.ink, fontSize: 30, fontWeight: '800', letterSpacing: -1, lineHeight: 33 },
  muted: { color: t.muted, fontSize: 14 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  ratingText: { color: t.ink, fontSize: 14, fontWeight: '700', fontFamily: rounded },
  verified: { alignSelf: 'flex-start', marginTop: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: t.brandPale, color: t.brand, fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 22 },
  compact: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line },
  compactTitle: { color: t.ink, fontSize: 15, fontWeight: '600' },
});
