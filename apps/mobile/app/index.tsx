import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Appearance, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import { getProductType, productTypes, type CatalogueResponse, type Listing, type ProductType } from '@katondo/contracts';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Same per-type colours as the website's pattern artwork. */
const typePalette: Record<ProductType, [string, string]> = {
  fashion: ['#1F5D7A', '#9FD3E6'], electronics: ['#0A3D2E', '#3BD18F'], vehicles: ['#1C2420', '#BFCBC4'],
  property: ['#0E7C57', '#BFEBD7'], home: ['#9A5A2C', '#F0CFAF'], food: ['#D9A821', '#5C3F05'],
  agriculture: ['#5E7A31', '#E1EBC2'], handmade: ['#6E3326', '#E8A97F'], services: ['#36437F', '#C7CEF4'], general: ['#2B3832', '#A7B7AE'],
};

const light = { paper: '#f4f7f5', surface: '#ffffff', ink: '#0f1a15', muted: '#5b6962', line: '#dde4e0', brand: '#0d7a55', brandPale: '#dcf1e6', live: '#f2631c', livePale: '#fff0e6' };
const dark = { paper: '#08130e', surface: '#0f1f18', ink: '#e9f2ed', muted: '#95a79e', line: '#1f3329', brand: '#2fbf87', brandPale: '#12382a', live: '#f2631c', livePale: '#3a1f10' };
type Theme = typeof light;
const rounded = Platform.select({ ios: 'ui-rounded', default: undefined });

function formatPrice(priceMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(priceMinor / 100);
}

/** A simple striped stand-in for the website's chitenge patterns until photos are uploaded. */
function TypeArt({ type, height, radius = 20 }: { type: ProductType; height: number | `${number}%`; radius?: number }) {
  const [bg, fg] = typePalette[type] ?? typePalette.general;
  return (
    <View style={{ height, borderRadius: radius, backgroundColor: bg, overflow: 'hidden' }}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <View key={index} style={{ position: 'absolute', left: -40 + index * 46, top: -20, width: 14, height: 400, backgroundColor: fg, opacity: 0.28, transform: [{ rotate: '-24deg' }] }} />
      ))}
    </View>
  );
}

function facts(listing: Listing, limit: number) {
  return getProductType(listing.productType).fields
    .filter((field) => field.highlight && listing.attributes[field.key])
    .slice(0, limit)
    .map((field) => ({ label: field.label, value: listing.attributes[field.key] }));
}

function ListingTile({ listing, locale, theme }: { listing: Listing; locale: string; theme: Theme }) {
  const s = styles(theme);
  const price = formatPrice(listing.priceMinor, listing.currency, locale);
  const open = () => Linking.openURL(`${webUrl}/listing/${listing.id}`);

  if (listing.displayStyle === 'spotlight') {
    return (
      <Pressable accessibilityRole="link" onPress={open} style={[s.wide, s.spotlight]}>
        <TypeArt type={listing.productType} height={190} />
        <View style={{ padding: 14, gap: 8 }}>
          <Text style={s.kicker}>{listing.categoryName}</Text>
          <Text style={s.spotlightTitle}>{listing.title}</Text>
          <View style={s.chips}>{facts(listing, 3).map((fact) => <Text key={fact.label} style={s.darkChip}>{/^[\d.,\s]+$/.test(fact.value) ? `${fact.label.replace(/\s*\(.*\)$/, '')} ${fact.value}` : fact.value}</Text>)}</View>
          <Text style={[s.price, { color: '#eef6f2', fontSize: 24 }]}>{price}</Text>
        </View>
      </Pressable>
    );
  }
  if (listing.displayStyle === 'spec') {
    return (
      <Pressable accessibilityRole="link" onPress={open} style={[s.wide, s.panel, { flexDirection: 'row', gap: 12 }]}>
        <View style={{ width: '40%' }}><TypeArt type={listing.productType} height={170} radius={16} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.title} numberOfLines={2}>{listing.title}</Text>
          {facts(listing, 3).map((fact) => (
            <View key={fact.label} style={s.specRow}><Text style={s.muted}>{fact.label}</Text><Text style={s.specValue}>{fact.value}</Text></View>
          ))}
          <Text style={[s.price, { marginTop: 'auto' }]}>{price}</Text>
        </View>
      </Pressable>
    );
  }
  if (listing.displayStyle === 'video') {
    return (
      <Pressable accessibilityRole="link" onPress={open} style={s.half}>
        <TypeArt type={listing.productType} height={300} />
        <View style={s.videoOverlay}>
          <Text style={[s.title, { color: '#fff' }]} numberOfLines={2}>{listing.title}</Text>
          <Text style={[s.price, { color: '#fff' }]}>{price}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="link" onPress={open} style={s.half}>
      <TypeArt type={listing.productType} height={listing.displayStyle === 'gallery' ? 190 : 210} />
      {listing.displayStyle === 'gallery' && (
        <View style={{ flexDirection: 'row', gap: 5, marginTop: 5 }}>
          <View style={{ flex: 1 }}><TypeArt type={listing.productType} height={44} radius={10} /></View>
          <View style={{ flex: 1 }}><TypeArt type={listing.productType} height={44} radius={10} /></View>
        </View>
      )}
      <Text style={[s.title, { marginTop: 8 }]} numberOfLines={2}>{listing.title}</Text>
      <Text style={s.price}>{price}</Text>
      <Text style={s.muted} numberOfLines={1}>{listing.sellerName}</Text>
    </Pressable>
  );
}

/** Light/dark switch. Overrides the phone's setting for as long as the app is open. */
function ThemeSwitch({ theme, isDark }: { theme: Theme; isDark: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onPress={() => Appearance.setColorScheme(isDark ? 'light' : 'dark')}
      hitSlop={8}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' }}
    >
      {isDark
        ? <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: theme.ink }} />
        : (
          <View style={{ width: 18, height: 18 }}>
            <View style={{ position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: theme.ink }} />
            <View style={{ position: 'absolute', left: 6, top: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: theme.surface }} />
          </View>
        )}
    </Pressable>
  );
}

export default function MarketplaceHome() {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? dark : light;
  const s = styles(theme);
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const countryName = catalogue?.market.countryName || process.env.EXPO_PUBLIC_DEPLOYMENT_COUNTRY_NAME || 'Zambia';
  const locale = catalogue?.market.locale || process.env.EXPO_PUBLIC_DEFAULT_LOCALE || 'en-ZM';
  const listings = catalogue?.listings ?? [];
  const quick = listings.filter((listing) => listing.displayStyle === 'compact');
  const rest = listings.filter((listing) => listing.displayStyle !== 'compact');

  useEffect(() => {
    fetch(`${apiUrl}/api/catalogue`)
      .then((response) => response.ok ? response.json() as Promise<CatalogueResponse> : Promise.reject())
      .then(setCatalogue)
      .catch(() => setCatalogue(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.topRow}>
          <View style={s.brandRow}>
            <View style={s.brandMark} />
            <Text style={s.brand}>katondo</Text>
          </View>
          <ThemeSwitch theme={theme} isDark={isDark} />
        </View>
        <Text style={s.heading}>Buy and sell anything in {countryName}.</Text>
        <View style={s.search}>
          <TextInput value={query} onChangeText={setQuery} placeholder="What are you looking for?" placeholderTextColor={theme.muted} style={s.searchInput}
            returnKeyType="search" onSubmitEditing={() => Linking.openURL(`${webUrl}/browse?q=${encodeURIComponent(query)}`)} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 16 }}>
          {productTypes.map((type) => (
            <Pressable key={type.id} accessibilityRole="link" style={s.typeChip} onPress={() => Linking.openURL(`${webUrl}/browse?type=${type.id}`)}>
              <View style={{ width: 26, height: 26, borderRadius: 13, overflow: 'hidden' }}><TypeArt type={type.id} height={26} radius={13} /></View>
              <Text style={s.typeChipText}>{type.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.live}><View style={s.liveDot} /><Text style={s.liveText}>Live auctions are on the way.</Text></View>

        <Text style={s.sectionTitle}>Newest listings</Text>
        {loading && <ActivityIndicator color={theme.brand} style={{ marginVertical: 24 }} />}
        {!loading && !catalogue && <Text style={s.muted}>Listings couldn’t load. Check your connection and try again.</Text>}
        {!loading && catalogue && !listings.length && <Text style={s.muted}>No listings yet. Be the first to sell something.</Text>}

        <View style={s.grid}>
          {rest.map((listing) => <ListingTile key={listing.id} listing={listing} locale={locale} theme={theme} />)}
        </View>

        {quick.length > 0 && (
          <View style={[s.panel, { marginTop: 18 }]}>
            <Text style={[s.sectionTitle, { marginTop: 0, fontSize: 19 }]}>Everyday buys</Text>
            {quick.map((listing) => (
              <Pressable key={listing.id} accessibilityRole="link" onPress={() => Linking.openURL(`${webUrl}/listing/${listing.id}`)} style={s.quickRow}>
                <View style={{ width: 48 }}><TypeArt type={listing.productType} height={48} radius={12} /></View>
                <View style={{ flex: 1 }}><Text style={s.title} numberOfLines={1}>{listing.title}</Text><Text style={s.muted}>{listing.sellerName}</Text></View>
                <Text style={s.price}>{formatPrice(listing.priceMinor, listing.currency, locale)}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable accessibilityRole="link" style={s.sellBand} onPress={() => Linking.openURL(`${webUrl}/sell/studio`)}>
          <Text style={s.sellTitle}>Your item, shown your way.</Text>
          <Text style={s.sellText}>Pick what you’re selling and how buyers see it.</Text>
          <Text style={s.sellButton}>Open the listing studio</Text>
        </Pressable>

        <View style={s.footerLinks}>
          <Text style={s.link} onPress={() => Linking.openURL(`${webUrl}/account`)}>Account settings</Text>
          <Text style={s.link} onPress={() => Linking.openURL(`${webUrl}/admin`)}>Katondo team</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = (t: Theme) => StyleSheet.create({
  content: { padding: 18, paddingTop: 60, paddingBottom: 48 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 20, height: 20, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomRightRadius: 6, borderBottomLeftRadius: 10, backgroundColor: t.brand },
  brand: { color: t.ink, fontSize: 21, fontWeight: '800', letterSpacing: -0.9 },
  heading: { color: t.ink, fontSize: 40, fontWeight: '800', letterSpacing: -1.6, lineHeight: 42, marginTop: 28 },
  search: { marginTop: 20, borderRadius: 999, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, paddingHorizontal: 18 },
  searchInput: { height: 52, fontSize: 16, color: t.ink },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 14, borderRadius: 999, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line },
  typeChipText: { color: t.ink, fontSize: 14, fontWeight: '500' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: t.livePale },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: t.live },
  liveText: { color: t.ink, fontSize: 14, fontWeight: '600' },
  sectionTitle: { color: t.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.6, marginTop: 28, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 22 },
  wide: { width: '100%' },
  half: { width: '48%' },
  panel: { padding: 12, borderRadius: 24, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line },
  spotlight: { padding: 8, borderRadius: 26, backgroundColor: '#062a1e' },
  kicker: { color: '#8fd3b4', fontSize: 13, fontWeight: '600' },
  spotlightTitle: { color: '#eef6f2', fontSize: 23, fontWeight: '700', letterSpacing: -0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  darkChip: { color: '#eef6f2', fontSize: 13, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  title: { color: t.ink, fontSize: 15, fontWeight: '600', lineHeight: 19 },
  price: { color: t.ink, fontSize: 16, fontWeight: '700', fontFamily: rounded, marginTop: 3 },
  muted: { color: t.muted, fontSize: 13 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: t.line },
  specValue: { color: t.ink, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  videoOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)' },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.line },
  sellBand: { marginTop: 32, padding: 24, borderRadius: 28, backgroundColor: '#062a1e' },
  sellTitle: { color: '#eef6f2', fontSize: 30, fontWeight: '800', letterSpacing: -1.2, lineHeight: 32 },
  sellText: { color: '#a9c5b7', fontSize: 15, marginTop: 10 },
  sellButton: { alignSelf: 'flex-start', marginTop: 18, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: '#ffffff', color: '#062a1e', fontWeight: '700', overflow: 'hidden' },
  footerLinks: { flexDirection: 'row', gap: 20, marginTop: 28 },
  link: { color: t.brand, fontSize: 14, fontWeight: '600' },
});
