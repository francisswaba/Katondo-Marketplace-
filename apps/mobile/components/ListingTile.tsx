import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Listing } from '@katondo/contracts';
import { TypeArt, facts, formatPrice, rounded, type Theme } from './kit';

/** One listing, drawn in the display style its seller chose. Opens the listing screen. */
export default function ListingTile({ listing, locale, theme }: { listing: Listing; locale: string; theme: Theme }) {
  const s = tileStyles(theme);
  const price = formatPrice(listing.priceMinor, listing.currency, locale);
  const open = () => router.push(`/listing/${listing.id}`);

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

const tileStyles = (t: Theme) => StyleSheet.create({
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
});
