'use client';

import { useState, type FormEvent } from 'react';
import { privacyRequestTypes, supportMessageMaxLength } from '@katondo/contracts';
import { apiUrl } from '../../../lib/catalogue';

export default function PrivacyRequestClient() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [requestType, setRequestType] = useState('');
  const [details, setDetails] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/support/privacy-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, requestType, details, website }),
      });
      const payload = await response.json().catch(() => null) as { reference?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'Your request could not be sent. Try again.');
      setReference(payload?.reference ?? '');
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (reference !== null) {
    return (
      <div className="help-form-wrap">
        <h1>Request received</h1>
        {reference && <p className="case-ref-large">{reference}</p>}
        <p>Keep this reference. We’ll reply to <strong>{email}</strong>. Before we share or change any information, we’ll check that it’s really you.</p>
        <a className="button-quiet" href="/help">Back to help</a>
      </div>
    );
  }

  return (
    <form className="help-form-wrap help-form" onSubmit={submit}>
      <a className="help-back" href="/help">Help and complaints</a>
      <h1>Your personal data</h1>
      <p className="help-muted">Ask to see, correct or delete the information Katondo holds about you, or to stop us using it in a certain way. You don’t need an account.</p>

      <label className="help-field">What would you like us to do?
        <select value={requestType} onChange={(event) => setRequestType(event.target.value)} required>
          <option value="" disabled>Choose one</option>
          {privacyRequestTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </label>
      <label className="help-field">Your name
        <input value={name} maxLength={120} autoComplete="name" onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="help-field">Email we can reply to
        <input type="email" value={email} maxLength={254} autoComplete="email" onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="help-field">Details
        <textarea value={details} maxLength={supportMessageMaxLength} rows={6} onChange={(event) => setDetails(event.target.value)}
          placeholder="Which account or phone number is this about? For corrections, tell us what should change." required />
      </label>
      {/* Hidden from people; bots fill it in. */}
      <label className="visually-hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      <p className="help-note">We only use these details to answer this request. Don’t include passwords, card numbers or ID numbers here; we’ll ask how to confirm your identity.</p>
      {error && <p className="studio-message error" role="alert">{error}</p>}
      <button className="button-primary" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send request'}</button>
    </form>
  );
}
