import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CatalogueResponse, Listing } from '@katondo/contracts';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

function formatPrice(priceMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(priceMinor / 100);
}

export default function MarketplaceHome() {
  const [catalogue, setCatalogue] = useState<CatalogueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const countryName = catalogue?.market.countryName || process.env.EXPO_PUBLIC_DEPLOYMENT_COUNTRY_NAME || 'Zambia';
  const locale = catalogue?.market.locale || process.env.EXPO_PUBLIC_DEFAULT_LOCALE || 'en-ZM';

  useEffect(() => {
    fetch(`${apiUrl}/api/catalogue`)
      .then((response) => response.ok ? response.json() as Promise<CatalogueResponse> : Promise.reject())
      .then(setCatalogue)
      .catch(() => setCatalogue(null))
      .finally(() => setLoading(false));
  }, []);

  const renderListing = ({ item }: { item: Listing }) => (
    <Pressable accessibilityRole="button" style={styles.card}>
      <View style={styles.imagePlaceholder}><Text style={styles.imageMark}>✳</Text></View>
      <Text style={styles.category}>{item.categoryName}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <View style={styles.details}>
        <Text style={styles.seller}>{item.sellerName}</Text>
        <Text style={styles.price}>{formatPrice(item.priceMinor, item.currency, locale)}</Text>
      </View>
    </Pressable>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={catalogue?.listings ?? []}
      keyExtractor={(item) => item.id}
      renderItem={renderListing}
      ListHeaderComponent={(
        <>
          <Text style={styles.wordmark}>katondo<Text style={styles.period}>.</Text></Text>
          <Text style={styles.eyebrow}>YOUR MARKETPLACE, REIMAGINED</Text>
          <Text style={styles.heading}>Good things find new homes.</Text>
          <Text style={styles.subheading}>Discover one-of-a-kind finds from people and businesses across {countryName}.</Text>
          <Pressable accessibilityRole="link" style={styles.accountButton} onPress={() => Linking.openURL(`${webUrl}/account`)}><Text style={styles.accountButtonText}>Account settings · Password, security and preferences ↗</Text></Pressable>
          <Pressable accessibilityRole="link" style={styles.staffButton} onPress={() => Linking.openURL(`${webUrl}/admin`)}><Text style={styles.staffButtonText}>Katondo team · Open staff workspace ↗</Text></Pressable>
          <Text style={styles.sectionTitle}>Browse categories</Text>
          {catalogue?.categories.map((category) => <Text key={category.id} style={styles.categoryPill}>{category.name}  ↗</Text>)}
          <Text style={styles.sectionTitle}>Picked for you</Text>
          {loading && <ActivityIndicator color="#214e3c" style={styles.loader} />}
          {!loading && !catalogue && <Text style={styles.empty}>Couldn’t load listings. Check your connection and try again.</Text>}
          {!loading && catalogue?.listings.length === 0 && <Text style={styles.empty}>New listings will appear here.</Text>}
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fbfaf7' },
  content: { padding: 22, paddingTop: 58, paddingBottom: 40 },
  wordmark: { color: '#214e3c', fontSize: 26, fontWeight: '800', letterSpacing: -1.5 },
  period: { color: '#e29369' },
  eyebrow: { color: '#77857c', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, marginTop: 36 },
  heading: { color: '#213c30', fontSize: 40, fontWeight: '600', letterSpacing: -1.8, lineHeight: 45, marginTop: 13, maxWidth: 340 },
  subheading: { color: '#748078', fontSize: 15, lineHeight: 23, marginTop: 13, maxWidth: 340 },
  accountButton: { alignSelf: 'flex-start', backgroundColor: '#214e3c', borderRadius: 7, marginTop: 19, paddingHorizontal: 13, paddingVertical: 11 },
  accountButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  staffButton: { alignSelf: 'flex-start', borderColor: '#cdd8cf', borderRadius: 7, borderWidth: 1, marginTop: 9, paddingHorizontal: 13, paddingVertical: 10 },
  staffButtonText: { color: '#214e3c', fontSize: 11, fontWeight: '700' },
  sectionTitle: { color: '#1b2924', fontSize: 21, fontWeight: '700', letterSpacing: -0.5, marginTop: 35, marginBottom: 15 },
  categoryPill: { alignSelf: 'flex-start', overflow: 'hidden', backgroundColor: '#e7eee4', borderRadius: 18, color: '#34483d', fontSize: 13, fontWeight: '600', marginBottom: 9, paddingHorizontal: 15, paddingVertical: 10 },
  card: { marginBottom: 21 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', height: 220, backgroundColor: '#e4e9df', borderRadius: 8 },
  imageMark: { color: '#759079', fontSize: 72, opacity: 0.7 },
  category: { color: '#879188', fontSize: 11, marginTop: 12 },
  title: { color: '#293b31', fontSize: 16, fontWeight: '600', marginTop: 5 },
  details: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  seller: { color: '#858e86', fontSize: 12 },
  price: { color: '#304b3b', fontSize: 13, fontWeight: '700' },
  loader: { marginVertical: 22 },
  empty: { color: '#859087', fontSize: 13, lineHeight: 20, marginTop: 6 },
});
