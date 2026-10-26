'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';
import { getUserManager, isCurrentUser, isOidcConfigured } from '../../lib/oidc';

type OnboardingConfig = {
  enabled: boolean;
  authenticationEnabled: boolean;
  sellerTerms: { version: string; url: string } | null;
  privacyNotice: { version: string; url: string } | null;
};

type SellerApplication = {
  id?: string;
  seller_type?: string;
  sellerType?: string;
  display_name?: string;
  displayName?: string;
  verification_status?: string;
  verificationStatus?: string;
  legal_name?: string;
  city?: string;
  accepted_at?: string;
  acceptedAt?: string;
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'Something went wrong. Please try again.';
}

export default function SellerOnboardingClient() {
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [sellerType, setSellerType] = useState<'individual' | 'business'>('individual');

  useEffect(() => {
    let active = true;
    const manager = getUserManager();

    Promise.all([
      fetch(`${apiUrl}/api/seller/onboarding/config`).then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<OnboardingConfig>;
      }),
      manager?.getUser() ?? Promise.resolve(null),
    ])
      .then(([nextConfig, nextUser]) => {
        if (!active) return;
        setConfig(nextConfig);
        setUser(isCurrentUser(nextUser) ? nextUser : null);
      })
      .catch((error: Error) => active && setMessage(error.message))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user?.access_token || !config?.authenticationEnabled) return;
    setApplicationLoading(true);
    fetch(`${apiUrl}/api/seller/onboarding`, {
      headers: { Authorization: `Bearer ${user.access_token}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<{ application: SellerApplication | null }>;
      })
      .then((payload) => setApplication(payload.application))
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setApplicationLoading(false));
  }, [config?.authenticationEnabled, user]);

  async function signIn() {
    setMessage('');
    const manager = getUserManager();
    if (!manager) {
      setMessage('Sign-in is not configured for this environment.');
      return;
    }
    await manager.signinRedirect({ state: { returnTo: '/sell' } });
  }

  async function signOut() {
    const manager = getUserManager();
    if (manager) await manager.signoutRedirect();
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.access_token) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/seller/onboarding`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sellerType,
          legalName: form.get('legalName'),
          displayName: form.get('displayName'),
          city: form.get('city'),
          businessRegistrationNumber: sellerType === 'business' ? form.get('businessRegistrationNumber') : '',
          acceptSellerTerms: form.get('acceptSellerTerms') === 'on',
          acknowledgePrivacyNotice: form.get('acknowledgePrivacyNotice') === 'on',
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = await response.json() as { application: SellerApplication };
      setApplication(payload.application);
      setMessage('Your application has been submitted for review.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your application could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  const status = application?.verification_status || application?.verificationStatus || 'pending';
  const configured = isOidcConfigured();
  const canSignIn = Boolean(config?.authenticationEnabled && configured);
  const canApply = Boolean(config?.enabled && config.authenticationEnabled && config.sellerTerms && config.privacyNotice && configured);

  return (
    <main className="page-shell seller-onboarding">
      <header className="topbar">
        <Link className="wordmark" href="/">katondo<span>.</span></Link>
        <div className="seller-header-actions">
          {user && <Link className="text-link" href="/account">Account settings</Link>}
          {user && <button className="text-button" type="button" onClick={signOut}>Sign out</button>}
          <Link className="text-link" href="/">Back to marketplace</Link>
        </div>
      </header>

      <section className="seller-intro">
        <p className="eyebrow">SELL WITH KATONDO · ZAMBIA</p>
        <h1>Good things start<br />with <em>good people.</em></h1>
        <p className="seller-lede">Create a storefront for the things you make, find, or have loved. Every seller is reviewed before listings can go live.</p>
        {loading && <div className="seller-availability" role="status"><span className="availability-dot" /><div><strong>Checking application availability</strong><p>This only takes a moment.</p></div></div>}
        {!loading && !canApply && <div className="seller-availability" role="status"><span className="availability-dot" /><div><strong>Seller applications aren’t open yet</strong><p>Secure sign-in, approved policies, and the release controls must all be active before applications can be collected.</p>{canSignIn && !user && <button className="primary-button button-reset" type="button" onClick={signIn}>Sign in to check status <span>→</span></button>}</div></div>}
        {!loading && canApply && !user && <div className="seller-availability available" role="status"><span className="availability-dot" /><div><strong>Seller applications are open</strong><p>Sign in with your verified account to start or check your application.</p><button className="primary-button button-reset" type="button" onClick={signIn}>Sign in to apply <span>→</span></button></div></div>}
        {message && <p className="form-message" role="status">{message}</p>}
      </section>

      {canSignIn && user && application && (
        <section className="application-status">
          <p className="eyebrow">APPLICATION RECEIVED</p>
          <h2>{application.display_name || application.displayName || 'Your storefront'}</h2>
          <p>Your application is <strong>{status.replace('_', ' ')}</strong>. We will update this status after review.</p>
          <dl><div><dt>Seller type</dt><dd>{application.seller_type || application.sellerType}</dd></div><div><dt>City</dt><dd>{application.city || 'Submitted'}</dd></div></dl>
        </section>
      )}

      {canApply && user && !applicationLoading && !application && (
        <section className="seller-form-section">
          <div><p className="eyebrow">YOUR APPLICATION</p><h2>Tell us about your storefront</h2><p>Use your legal details. We only ask for the information needed for this first review.</p></div>
          <form className="seller-form" onSubmit={submitApplication}>
            <fieldset className="seller-type-choice"><legend>Seller type</legend><label><input type="radio" name="sellerType" checked={sellerType === 'individual'} onChange={() => setSellerType('individual')} /> Individual</label><label><input type="radio" name="sellerType" checked={sellerType === 'business'} onChange={() => setSellerType('business')} /> Registered business</label></fieldset>
            <label>Legal name<input name="legalName" required minLength={2} maxLength={160} autoComplete="name" /></label>
            <label>Storefront name<input name="displayName" required minLength={2} maxLength={120} /></label>
            <label>City<input name="city" required minLength={2} maxLength={100} autoComplete="address-level2" /></label>
            {sellerType === 'business' && <label>Business registration number<input name="businessRegistrationNumber" required minLength={2} maxLength={80} /></label>}
            <label className="check-row"><input type="checkbox" name="acceptSellerTerms" required /><span>I accept the <a href={config!.sellerTerms!.url} target="_blank" rel="noreferrer">Seller Terms ({config!.sellerTerms!.version})</a>.</span></label>
            <label className="check-row"><input type="checkbox" name="acknowledgePrivacyNotice" required /><span>I have read the <a href={config!.privacyNotice!.url} target="_blank" rel="noreferrer">Privacy Notice ({config!.privacyNotice!.version})</a>.</span></label>
            <button className="primary-button button-reset" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit application'} <span>→</span></button>
          </form>
        </section>
      )}

      <section className="seller-types">
        <article><span className="seller-step">01 · INDIVIDUAL</span><h2>Sell something personal</h2><p>For people giving a pre-loved item a new home. The application asks for your legal name, storefront name, and city.</p></article>
        <article><span className="seller-step">02 · REGISTERED BUSINESS</span><h2>Grow your business</h2><p>For registered businesses building a customer base. The application also asks for your business registration number.</p></article>
      </section>

      <section className="seller-review">
        <p className="eyebrow">A CAREFUL START</p><h2>How seller review works</h2>
        <ol><li><span>01</span><div><strong>Apply securely</strong><p>Sign in, choose your seller type, and share the details needed to review your storefront.</p></div></li><li><span>02</span><div><strong>We review your application</strong><p>Your application stays private and pending review. We explain any additional verification before requesting it.</p></div></li><li><span>03</span><div><strong>Get approved before selling</strong><p>Only approved sellers can publish listings. Approval and document checks are not automatic.</p></div></li></ol>
      </section>

      <footer><Link className="wordmark" href="/">katondo<span>.</span></Link><p>Good finds. Good people. Right here.</p><span>Made for Zambia&nbsp; ✳</span></footer>
    </main>
  );
}
