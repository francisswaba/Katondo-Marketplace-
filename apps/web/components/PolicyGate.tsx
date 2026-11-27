'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getUserManager } from '../lib/oidc';
import { useSignedInUser } from '../lib/useSignedInUser';

type Settings = { account: { policiesRequired?: boolean; policyVersion?: string | null } };

// Pages people must be able to read (or use to leave) before accepting.
const openPaths = ['/privacy', '/terms', '/seller-terms', '/account', '/auth'];

/** Asks signed-in customers, once per policy version, to confirm they are 18+ and accept the privacy notice and terms. */
export default function PolicyGate() {
  const { user, api } = useSignedInUser();
  const pathname = usePathname();
  const [version, setVersion] = useState<string | null>(null);
  const [adult, setAdult] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    api<Settings>('/api/account/settings')
      .then(({ account }) => setVersion(account.policiesRequired && account.policyVersion ? account.policyVersion : null))
      .catch(() => undefined);
  }, [user, api]);

  const show = Boolean(version) && !openPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  useEffect(() => { if (show) firstField.current?.focus(); }, [show]);
  if (!show) return null;

  async function accept(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/api/account/accept-policies', { method: 'POST', body: { confirmAdult: adult, acceptPolicies: accepted, version } });
      window.location.reload();
    } catch (acceptError) {
      setError((acceptError as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="policy-gate" role="dialog" aria-modal="true" aria-labelledby="policy-gate-title">
      <form className="policy-gate-card" onSubmit={accept}>
        <h2 id="policy-gate-title">Before you start</h2>
        <p>Katondo is for people aged 18 and over. Please confirm your age and read how we handle your information and what we expect from everyone on Katondo.</p>
        <label className="policy-check"><input ref={firstField} type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} required /><span>I’m 18 or over</span></label>
        <label className="policy-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} required /><span>I accept Katondo’s <a href="/terms" target="_blank">Terms of use</a> and have read the <a href="/privacy" target="_blank">Privacy notice</a></span></label>
        {error && <p className="studio-message error" role="alert">{error}</p>}
        <div className="policy-actions">
          <button className="button-primary" type="submit" disabled={saving || !adult || !accepted}>{saving ? 'Saving…' : 'Continue'}</button>
          <button className="text-button" type="button" onClick={() => getUserManager()?.signoutRedirect()}>Sign out</button>
        </div>
        <p className="policy-small">Don’t agree? Sign out, or close your account from <a href="/account">Account settings</a>.</p>
      </form>
    </div>
  );
}
