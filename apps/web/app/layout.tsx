import type { Metadata, Viewport } from 'next';
import './styles.css';
import './pages.css';
import './account.css';
import './release.css';
import './page-overrides.css';
import { fallbackMarket } from '../lib/market';

const market = fallbackMarket();

export const metadata: Metadata = {
  title: `Katondo | ${market.countryName} marketplace`,
  description: `Discover products from independent sellers and businesses in ${market.countryName}.`,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#08130e' },
  ],
};

// Applies the saved light/dark choice before the page paints, so it never flashes the wrong theme.
const themeScript = `try{var t=localStorage.getItem('katondo-theme');if(t==='light'||t==='dark'||t==='system')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={market.locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
