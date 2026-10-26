'use client';

import { useEffect, useState } from 'react';

type ReleaseControl = {
  control_key: string;
  status: 'pending' | 'approved' | 'revoked';
  approver_authority?: string;
  evidence_reference?: string;
  notes?: string;
  approved_at?: string;
  expires_at?: string;
  effective: boolean;
};

type Readiness = {
  controls: ReleaseControl[];
  checks: Record<string, boolean>;
  onboardingOpen: boolean;
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'The request could not be completed.';
}

export default function ReleaseControlsPanel({ token, canManage }: { token: string; canManage: boolean }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/release-controls`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<Readiness>;
      })
      .then(setReadiness)
      .catch((error: Error) => setMessage(error.message));
  }, [token]);

  async function updateControl(element: HTMLFormElement, controlKey: string, status: 'approved' | 'revoked') {
    const form = new FormData(element);
    setSaving(controlKey);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/admin/release-controls/${controlKey}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          approverAuthority: form.get('approverAuthority'),
          evidenceReference: form.get('evidenceReference'),
          notes: form.get('notes'),
          expiresAt: form.get('expiresAt') || null,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setReadiness(await response.json() as Readiness);
      setMessage(status === 'approved' ? 'Approval evidence recorded.' : 'Release approval revoked; affected features are now closed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The release control could not be updated.');
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="admin-section release-controls">
      <div className="admin-section-title"><div><p className="eyebrow">RELEASE GOVERNANCE</p><h2>Secure sign-in and policy approvals</h2></div><span className={readiness?.onboardingOpen ? 'release-open' : 'release-closed'}>{readiness?.onboardingOpen ? 'Onboarding open' : 'Onboarding closed'}</span></div>
      <p className="section-copy">These records document external approvals; they do not create legal approval. Seller onboarding stays closed unless every approval is effective and every deployment check passes.</p>
      {message && <p className="admin-flash">{message}</p>}
      {readiness && <div className="release-checks">{Object.entries(readiness.checks).map(([key, passed]) => <span className={passed ? 'passed' : 'failed'} key={key}>{passed ? '✓' : '×'} {label(key)}</span>)}</div>}
      <div className="release-list">
        {readiness?.controls.map((control) => <form key={control.control_key} onSubmit={(event) => { event.preventDefault(); void updateControl(event.currentTarget, control.control_key, 'approved'); }}>
          <div className="release-control-heading"><div><strong>{label(control.control_key)}</strong><small>{control.approved_at ? `Recorded ${new Date(control.approved_at).toLocaleString('en-ZM')}` : 'No effective approval recorded'}</small></div><span className={`status-pill ${control.effective ? 'active' : 'disabled'}`}>{control.effective ? 'effective' : control.status}</span></div>
          {canManage && <div className="release-fields"><label>Approving authority<input name="approverAuthority" defaultValue={control.approver_authority || ''} maxLength={200} required /></label><label>Evidence reference<input name="evidenceReference" defaultValue={control.evidence_reference || ''} maxLength={500} placeholder="Document ID or controlled HTTPS record" required /></label><label>Expiry, if applicable<input name="expiresAt" type="date" defaultValue={control.expires_at?.slice(0, 10) || ''} /></label><label className="release-notes">Notes<textarea name="notes" defaultValue={control.notes || ''} maxLength={1000} /></label><div className="release-actions"><button type="submit" disabled={saving === control.control_key}>Record approval</button><button className="danger-button" type="button" disabled={saving === control.control_key || control.status === 'revoked'} onClick={(event) => { const formElement = event.currentTarget.closest('form'); if (formElement) void updateControl(formElement, control.control_key, 'revoked'); }}>Revoke</button></div></div>}
        </form>)}
      </div>
    </section>
  );
}
