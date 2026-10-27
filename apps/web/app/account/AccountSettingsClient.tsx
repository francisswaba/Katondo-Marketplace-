'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';
import type { MarketConfiguration } from '@katondo/contracts';
import { getUserManager, isCurrentUser, isOidcConfigured } from '../../lib/oidc';

type Preferences = {
  locale: string;
  theme: 'system' | 'light' | 'dark';
  marketingEmails: boolean;
  marketplaceUpdates: boolean;
  orderUpdates: boolean;
  savedSearchAlerts: boolean;
  sellerActivityAlerts: boolean;
  staffOperationalAlerts: boolean;
  available: { buyer: boolean; seller: boolean; staff: boolean };
};

type AccountPayload = {
  account: { displayName?: string; email?: string; phone?: string; roles: string[] };
  market: MarketConfiguration;
  preferences: Preferences;
};

function localeLabel(locale: string) {
  try {
    return new Intl.DisplayNames([locale, 'en'], { type: 'language' }).of(locale) || locale;
  } catch {
    return locale;
  }
}

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const accountUrl = process.env.NEXT_PUBLIC_AUTH_ACCOUNT_URL;

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'The request could not be completed.';
}

function applyTheme(theme: Preferences['theme']) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem('katondo-theme', theme);
}

export default function AccountSettingsClient() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AccountPayload | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const manager = getUserManager();
    if (!manager) {
      setLoading(false);
      return;
    }
    manager.getUser().then((nextUser) => setUser(isCurrentUser(nextUser) ? nextUser : null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user?.access_token) return;
    setLoading(true);
    fetch(`${apiUrl}/api/account/settings`, { headers: { Authorization: `Bearer ${user.access_token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<AccountPayload>;
      })
      .then((payload) => {
        setData(payload);
        setPreferences(payload.preferences);
        applyTheme(payload.preferences.theme);
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [user]);

  async function signIn() {
    setMessage('');
    await getUserManager()?.signinRedirect({ state: { returnTo: '/account' } });
  }

  async function signOut() {
    await getUserManager()?.signoutRedirect();
  }

  function updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => current ? { ...current, [key]: value } : current);
    if (key === 'theme') applyTheme(value as Preferences['theme']);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user?.access_token || !preferences) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/account/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${user.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { preferences: Preferences };
      setPreferences(payload.preferences);
      setMessage('Your account settings have been saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Account settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="account-gate"><Link className="wordmark" href="/">katondo<span>.</span></Link><p>Opening your account…</p></main>;

  if (!user || !data || !preferences) {
    return <main className="account-gate"><Link className="wordmark" href="/">katondo<span>.</span></Link><section className="account-login-card"><p className="eyebrow">YOUR ACCOUNT</p><h1>Settings that travel with you.</h1><p>Sign in to manage password and security, contact details, appearance, and notifications.</p>{message && <p className="form-message">{message}</p>}{isOidcConfigured() ? <button className="primary-button button-reset" type="button" onClick={signIn}>Sign in to your account <span>→</span></button> : <p className="account-note">Account sign-in is not configured for this environment.</p>}</section></main>;
  }

  return (
    <main className="account-shell">
      <header className="admin-topbar"><div><Link className="wordmark" href="/">katondo<span>.</span></Link><span className="admin-badge">Account</span></div><div className="admin-user"><span>{data.account.displayName || data.account.email || 'Katondo member'}</span><button className="text-button" type="button" onClick={signOut}>Sign out</button></div></header>
      <section className="account-heading"><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Make Katondo work for you.</h1><p>Security details stay with the approved sign-in provider. Marketplace preferences are stored by Katondo.</p></section>
      {message && <p className="admin-flash">{message}</p>}
      <section className="account-grid">
        <article className="account-card"><p className="eyebrow">SIGN-IN & SECURITY</p><h2>Password and account security</h2><p>Update your password, recovery methods, multi-factor authentication and verified contact details securely with the sign-in provider.</p>{accountUrl ? <a className="primary-button" href={accountUrl} target="_blank" rel="noreferrer">Manage password and security <span>↗</span></a> : <p className="account-warning">The administrator must configure the identity provider’s account-management URL before password changes are available.</p>}</article>
        <article className="account-card"><p className="eyebrow">IDENTITY</p><h2>Your verified account</h2><dl><div><dt>Name</dt><dd>{data.account.displayName || 'Managed by sign-in provider'}</dd></div><div><dt>Email</dt><dd>{data.account.email || 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{data.account.phone || 'Not provided'}</dd></div></dl>{accountUrl && <a className="text-link" href={accountUrl} target="_blank" rel="noreferrer">Update contact details ↗</a>}</article>
      </section>
      <form className="account-preferences" onSubmit={save}>
        <div className="admin-section-title"><div><p className="eyebrow">PREFERENCES</p><h2>Marketplace experience</h2></div><span>Applied to your account</span></div>
        <div className="preference-selects"><label>Language and region<select value={preferences.locale} onChange={(event) => updatePreference('locale', event.target.value)}>{data.market.supportedLocales.map((locale) => <option value={locale} key={locale}>{localeLabel(locale)}</option>)}</select></label><label>Appearance<select value={preferences.theme} onChange={(event) => updatePreference('theme', event.target.value as Preferences['theme'])}><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
        <div className="preference-list">
          <PreferenceRow label="Marketplace updates" detail="Important product and service announcements." checked={preferences.marketplaceUpdates} onChange={(value) => updatePreference('marketplaceUpdates', value)} />
          <PreferenceRow label="Offers and discovery" detail="Optional promotions, recommendations and marketplace news." checked={preferences.marketingEmails} onChange={(value) => updatePreference('marketingEmails', value)} />
          {preferences.available.buyer && <><PreferenceRow label="Order updates" detail="Purchase, delivery, return and dispute updates." checked={preferences.orderUpdates} onChange={(value) => updatePreference('orderUpdates', value)} /><PreferenceRow label="Saved-search alerts" detail="Notifications when matching items become available." checked={preferences.savedSearchAlerts} onChange={(value) => updatePreference('savedSearchAlerts', value)} /></>}
          {preferences.available.seller && <PreferenceRow label="Seller activity" detail="Listing, order, payout and storefront notifications." checked={preferences.sellerActivityAlerts} onChange={(value) => updatePreference('sellerActivityAlerts', value)} />}
          {preferences.available.staff && <><PreferenceRow label="Operational digest" detail="Role-relevant queue and marketplace summaries." checked={preferences.staffOperationalAlerts} onChange={(value) => updatePreference('staffOperationalAlerts', value)} /><div className="setting-row locked-setting"><span><strong>Security alerts</strong><small>Mandatory alerts for sensitive staff-account activity.</small></span><b>Always on</b></div></>}
        </div>
        <button className="primary-button button-reset" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
      </form>
      <footer><Link className="wordmark" href="/">katondo<span>.</span></Link><p>Your account. Your choices.</p><span><Link className="staff-link" href="/">Marketplace</Link>{preferences.available.staff && <>&nbsp; · &nbsp;<Link className="staff-link" href="/admin">Staff workspace</Link></>}</span></footer>
    </main>
  );
}

function PreferenceRow({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
