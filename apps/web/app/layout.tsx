import type { Metadata } from 'next';
import './styles.css';
import './account.css';
import './release.css';
import ThemeBootstrap from './ThemeBootstrap';

export const metadata: Metadata = {
  title: 'Katondo | Zambia’s marketplace',
  description: 'Discover products from independent sellers and businesses in Zambia.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZM">
      <body><ThemeBootstrap />{children}</body>
    </html>
  );
}
