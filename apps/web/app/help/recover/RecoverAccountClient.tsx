'use client';

import { useState, type FormEvent } from 'react';
import { supportMessageMaxLength } from '@katondo/contracts';
import { apiUrl } from '../../../lib/catalogue';

export default function RecoverAccountClient() {
  const [form, setForm] = useState({ name: '', accountEmail: '', contactEmail: '', phone: '', shopName: '', details: '', website: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ reference: string | null; holdHours: number } | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/support/account-recovery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null) as { reference?: string | null; holdHours?: number; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'Your request could not be sent. Try again.');
      setDone({ reference: payload?.reference ?? null, holdHours: payload?.holdHours ?? 72 });
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="help-form-wrap">
        <h1>Request received</h1>
        {done.reference && <p className="case-ref-large">{done.reference}</p>}
        <p>Keep this reference. We’ll contact you at <strong>{form.contactEmail}</strong> to check it’s really you.</p>
        <p className="help-muted">To protect you, no change is made for at least {Math.round(done.holdHours / 24)} days, and two different Katondo staff members must agree. If you didn’t send this request, contact us straight away.</p>
        <p className="help-note">Katondo staff will never ask for your password, PIN or card number. Check a staff member’s number on <a href="/help/check-staff">Check a staff member</a>.</p>
        <a className="button-quiet" href="/help">Back to help</a>
      </div>
    );
  }

  return (
    <form className="help-form-wrap help-form" onSubmit={submit}>
      <a className="help-back" href="/help">Help and complaints</a>
      <h1>Recover your account</h1>
      <p className="help-muted">Use this if you can no longer use the email address on your Katondo account. If you just forgot your password, go to <strong>Sign in</strong> and choose <strong>Forgot password?</strong> instead; it’s quicker.</p>

      <label className="help-field">Your name, as on your account
        <input value={form.name} maxLength={120} autoComplete="name" onChange={set('name')} required />
      </label>
      <label className="help-field">Email address on your account (the one you can’t use)
        <input type="email" value={form.accountEmail} maxLength={254} onChange={set('accountEmail')} required />
      </label>
      <label className="help-field">New email we can reach you on
        <input type="email" value={form.contactEmail} maxLength={254} autoComplete="email" onChange={set('contactEmail')} required />
      </label>
      <label className="help-field">Phone number (optional)
        <input type="tel" value={form.phone} maxLength={40} autoComplete="tel" onChange={set('phone')} />
      </label>
      <label className="help-field">Shop name, if you sell on Katondo (optional)
        <input value={form.shopName} maxLength={120} onChange={set('shopName')} />
      </label>
      <label className="help-field">What can you tell us about your account?
        <textarea value={form.details} maxLength={supportMessageMaxLength} rows={6} onChange={set('details')} required
          placeholder="For example: roughly when you joined, things you bought or sold recently, who you messaged, and why you lost the email." />
      </label>
      <label className="visually-hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
      <p className="help-note">Don’t include passwords, PINs, card numbers or ID numbers. If we need to see an ID, we’ll tell you how to share it safely.</p>
      {error && <p className="studio-message error" role="alert">{error}</p>}
      <button className="button-primary" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send recovery request'}</button>
    </form>
  );
}
