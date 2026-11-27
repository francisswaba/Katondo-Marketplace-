'use client';

import { useState, type FormEvent } from 'react';
import { parseStaffNumber } from '@katondo/contracts';
import { apiUrl } from '../../../lib/catalogue';

type Result = { valid: boolean; reason?: 'format' | 'typo'; staffNumber?: string; firstName?: string; jobTitle?: string | null };

export default function CheckStaffClient() {
  const [number, setNumber] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function check(event: FormEvent) {
    event.preventDefault();
    setChecking(true);
    setError('');
    setResult(null);
    const parsed = parseStaffNumber(number);
    if (!parsed.ok) {
      setResult({ valid: false, reason: parsed.reason });
      setChecking(false);
      return;
    }
    try {
      const response = await fetch(`${apiUrl}/api/staff/verify/${encodeURIComponent(parsed.staffNumber)}`);
      const payload = await response.json().catch(() => null) as (Result & { error?: string }) | null;
      if (!response.ok) throw new Error(payload?.error || 'The check didn’t work. Try again.');
      setResult(payload);
    } catch (checkError) {
      setError((checkError as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="help-form-wrap">
      <a className="help-back" href="/help">Help and complaints</a>
      <h1>Check a staff member</h1>
      <p className="help-muted">Every Katondo staff member has a staff number, such as S-7QM4-R9K. It appears on their replies to you. If someone calls, messages or emails claiming to be from Katondo, ask for their number and check it here.</p>
      <form className="staff-check" onSubmit={check}>
        <label className="help-field">Staff number
          <input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="S-7QM4-R9K" autoComplete="off" spellCheck={false} autoCapitalize="characters" required />
        </label>
        <button className="button-primary" type="submit" disabled={checking}>{checking ? 'Checking…' : 'Check'}</button>
      </form>
      {error && <p className="studio-message error" role="alert">{error}</p>}
      {result?.valid && (
        <p className="staff-result ok" role="status"><strong>{result.firstName}</strong> ({result.staffNumber}) works for Katondo{result.jobTitle ? ` as ${result.jobTitle}` : ''}.</p>
      )}
      {result && !result.valid && result.reason && (
        <p className="staff-result warn" role="status"><strong>{result.reason === 'typo' ? 'That number looks mistyped.' : 'Staff numbers look like S-7QM4-R9K.'}</strong> Check each character with the person and try again. Staff numbers never contain 0, 1, I, L, O or U.</p>
      )}
      {result && !result.valid && !result.reason && (
        <p className="staff-result bad" role="status"><strong>This number doesn’t belong to anyone working for Katondo.</strong> Don’t share any details or send money. Report it through <a href="/help/new?category=other">Help</a>.</p>
      )}
      <p className="help-note">Even real staff will never ask for your password, PIN, card number or a payment outside Katondo.</p>
    </div>
  );
}
