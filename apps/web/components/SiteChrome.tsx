import BrandMark from './BrandMark';
import MessagesBadge from './MessagesBadge';
import { getFeatures } from '../lib/catalogue';
import ThemeToggle from './ThemeToggle';

type NavKey = 'home' | 'browse' | 'sell' | 'messages' | 'account';

function Icon({ name }: { name: NavKey | 'search' }) {
  const paths: Record<NavKey | 'search', string> = {
    home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4Z',
    browse: 'M4 5h7v7H4ZM13 5h7v7h-7ZM4 14h7v6H4ZM13 14h7v6h-7Z',
    search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm9 16-4-4',
    sell: 'M12 5v14M5 12h14',
    messages: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4Z',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={paths[name]} /></svg>;
}

/**
 * `live` pulses the logo's dot while an auction is running. Pass it once live
 * auctions exist; until then the header logo stays still.
 */
export async function SiteHeader({ query = '', live = false }: { query?: string; live?: boolean }) {
  const features = await getFeatures();
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label={live ? 'Katondo home, live auction on now' : 'Katondo home'}>
        <BrandMark live={live} />
        katondo
      </a>
      <form className="header-search" action="/browse" role="search">
        <Icon name="search" />
        <label className="visually-hidden" htmlFor="header-search">Search Katondo</label>
        <input id="header-search" name="q" defaultValue={query} placeholder="Search cars, phones, chitenge…" />
      </form>
      <nav className="header-nav" aria-label="Main">
        <a href="/browse">Browse</a>
        {features.messaging && <a href="/messages" className="messages-link">Messages<MessagesBadge /></a>}
        <a href="/account">Account</a>
        <a className="button-primary" href="/sell/studio">Sell an item</a>
      </nav>
      <ThemeToggle />
    </header>
  );
}

export async function BottomNav({ active }: { active: NavKey }) {
  const features = await getFeatures();
  const items: { key: NavKey; href: string; label: string }[] = [
    { key: 'home', href: '/', label: 'Home' },
    { key: 'browse', href: '/browse', label: 'Browse' },
    { key: 'sell', href: '/sell/studio', label: 'Sell' },
    ...(features.messaging ? [{ key: 'messages' as const, href: '/messages', label: 'Messages' }] : []),
    { key: 'account', href: '/account', label: 'Account' },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map((item) => (
        <a key={item.key} href={item.href} aria-current={item.key === active ? 'page' : undefined} className={item.key === 'sell' ? 'bottom-sell' : undefined}>
          <Icon name={item.key} />
          <span>{item.label}</span>
          {item.key === 'messages' && <MessagesBadge />}
        </a>
      ))}
    </nav>
  );
}

export function SiteFooter({ countryName }: { countryName: string }) {
  return (
    <footer className="site-footer">
      <a className="brand" href="/"><BrandMark />katondo</a>
      <p>Buy and sell with people and businesses across {countryName}.</p>
      <nav aria-label="Footer">
        <a href="/sell">Become a seller</a>
        <a href="/account">Account settings</a>
        <a href="/admin">Katondo team</a>
      </nav>
    </footer>
  );
}
