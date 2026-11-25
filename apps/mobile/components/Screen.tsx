import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, ThemeSwitch, useTheme } from './kit';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Page frame for screens below home: back button, theme switch and a scrolling body. */
export default function Screen({ children, refreshing, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <View style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: theme.paper, borderBottomColor: theme.line }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} hitSlop={8}
          style={[styles.back, { borderColor: theme.line, backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.ink, fontSize: 24, lineHeight: 26, marginTop: -2 }}>‹</Text>
        </Pressable>
        <Pressable accessibilityRole="link" accessibilityLabel="Katondo home" onPress={() => router.dismissTo('/')} style={styles.brand}>
          <BrandMark size={22} colour={theme.brand} />
          <Text style={{ color: theme.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.7 }}>katondo</Text>
        </Pressable>
        <ThemeSwitch theme={theme} isDark={isDark} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 48 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.brand} /> : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
});
