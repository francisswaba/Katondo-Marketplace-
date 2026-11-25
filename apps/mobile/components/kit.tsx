import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Appearance, Easing, Platform, Pressable, Text, View, useColorScheme } from 'react-native';
import { getProductType, type Listing, type ProductType } from '@katondo/contracts';


export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
export const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Same per-type colours as the website's pattern artwork. */
export const typePalette: Record<ProductType, [string, string]> = {
  fashion: ['#1F5D7A', '#9FD3E6'], electronics: ['#0A3D2E', '#3BD18F'], vehicles: ['#1C2420', '#BFCBC4'],
  property: ['#0E7C57', '#BFEBD7'], home: ['#9A5A2C', '#F0CFAF'], food: ['#D9A821', '#5C3F05'],
  agriculture: ['#5E7A31', '#E1EBC2'], handmade: ['#6E3326', '#E8A97F'], services: ['#36437F', '#C7CEF4'], general: ['#2B3832', '#A7B7AE'],
};

export const light = { paper: '#f4f7f5', surface: '#ffffff', ink: '#0f1a15', muted: '#5b6962', line: '#dde4e0', brand: '#0d7a55', brandPale: '#dcf1e6', live: '#f2631c', livePale: '#fff0e6' };
export const dark = { paper: '#08130e', surface: '#0f1f18', ink: '#e9f2ed', muted: '#95a79e', line: '#1f3329', brand: '#2fbf87', brandPale: '#12382a', live: '#f2631c', livePale: '#3a1f10' };
export type Theme = typeof light;
export const rounded = Platform.select({ ios: 'ui-rounded', default: undefined });

export function formatPrice(priceMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(priceMinor / 100);
}

/** A simple striped stand-in for the website's chitenge patterns until photos are uploaded. */
export function TypeArt({ type, height, radius = 20 }: { type: ProductType; height: number | `${number}%`; radius?: number }) {
  const [bg, fg] = typePalette[type] ?? typePalette.general;
  return (
    <View style={{ height, borderRadius: radius, backgroundColor: bg, overflow: 'hidden' }}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <View key={index} style={{ position: 'absolute', left: -40 + index * 46, top: -20, width: 14, height: 400, backgroundColor: fg, opacity: 0.28, transform: [{ rotate: '-24deg' }] }} />
      ))}
    </View>
  );
}

export function facts(listing: Listing, limit: number) {
  return getProductType(listing.productType).fields
    .filter((field) => field.highlight && listing.attributes[field.key])
    .slice(0, limit)
    .map((field) => ({ label: field.label, value: listing.attributes[field.key] }));
}

/** A ring that ripples out from the live dot. Holds still when the phone asks for reduced motion. */
export function PulseRing({ size, colour = '#f2631c' }: { size: number; colour?: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => setReduced(false));
  }, []);
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [progress, reduced]);
  const scale = reduced ? 1.6 : progress.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = reduced ? 0.35 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(1.5, size / 6), borderColor: colour, opacity, transform: [{ scale }] }} />
  );
}

/** The Katondo "Live" mark: a rounded K (follows the theme colour) with the orange live dot. */
export function BrandMark({ size = 26, colour, live = false }: { size?: number; colour: string; live?: boolean }) {
  const u = size / 120;
  const bar = (cx: number, cy: number, length: number, angle: number) => ({
    position: 'absolute' as const, left: (cx - length / 2) * u, top: (cy - 12) * u,
    width: length * u, height: 24 * u, borderRadius: 12 * u, backgroundColor: colour, transform: [{ rotate: `${angle}deg` }],
  });
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: 'absolute', left: 20 * u, top: 18 * u, width: 24 * u, height: 92 * u, borderRadius: 12 * u, backgroundColor: colour }} />
      <View style={bar(79, 83, 72.4, 38.3)} />
      <View style={bar(69, 50, 56.6, -47.5)} />
      <View style={{ position: 'absolute', left: 86 * u, top: 8 * u, width: 24 * u, height: 24 * u, alignItems: 'center', justifyContent: 'center' }}>
        {live && <PulseRing size={24 * u} />}
        <View style={{ width: 24 * u, height: 24 * u, borderRadius: 12 * u, backgroundColor: '#f2631c' }} />
      </View>
    </View>
  );
}

/** Light/dark switch. Overrides the phone's setting for as long as the app is open. */
export function ThemeSwitch({ theme, isDark }: { theme: Theme; isDark: boolean }) {
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

export function useTheme() {
  const isDark = useColorScheme() === 'dark';
  return { theme: isDark ? dark : light, isDark };
}

/** Five stars filled to the rating, rounded to the nearest half. Decorative: pair it with text. */
export function Stars({ rating, size = 14, theme }: { rating: number; size?: number; theme: Theme }) {
  const rounded = Math.round(rating * 2) / 2;
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, rounded - index));
        return (
          <View key={index} style={{ width: size, height: size }}>
            <Text style={{ position: 'absolute', fontSize: size, lineHeight: size + 1, color: theme.line }}>★</Text>
            {fill > 0 && (
              <View style={{ position: 'absolute', width: size * fill, height: size + 1, overflow: 'hidden' }}>
                <Text style={{ fontSize: size, lineHeight: size + 1, color: theme.brand }}>★</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function ratingLabel(average: number, count: number) {
  return `Rated ${average.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`;
}

/** GET an API path; resolves to null when the request fails or the item doesn't exist. */
export async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiUrl}${path}`);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}
