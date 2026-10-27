import type { Metadata } from 'next';
import './styles.css';
import './account.css';
import './release.css';
import ThemeBootstrap from './ThemeBootstrap';
import { fallbackMarket } from '../lib/market';

const market = fallbackMarket();

export const metadata: Metadata = {
  title: `Katondo | ${market.countryName} marketplace`,
  description: `Discover products from independent sellers and businesses in ${market.countryName}.`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={market.locale}>
      <body><ThemeBootstrap />{children}</body>
    </html>
  );
}
