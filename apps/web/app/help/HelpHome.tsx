'use client';

import { useEffect, useState } from 'react';
import { supportCategories, supportStatusLabels, type SupportCaseSummary } from '@katondo/contracts';
import { useSignedInUser } from '../../lib/useSignedInUser';

const startable = supportCategories.filter((category) => !category.id.startsWith('report_') && category.id !== 'privacy_request' && category.id !== 'account_recovery');

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en-ZM', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HelpHome() {
  const { user, checked, api, signIn, signInAvailable } = useSignedInUser();
  const [cases, setCases] = useState<SupportCaseSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    api<{ cases: SupportCaseSummary[] }>('/api/support/cases').then((payload) => setCases(payload.cases)).catch((loadError: Error) => setError(loadError.message));
  }, [user, api]);

  return (
    <div className="help-layout">
      <section aria-labelledby="start-heading">
        <h2 id="start-heading">What do you need help with?</h2>
        <ul className="help-topics">
          {startable.map((category) => (
            <li key={category.id}>
              <a href={`/help/new?category=${category.id}`}>
                <strong>{category.label}</strong>
                <span>{category.description}</span>
              </a>
            </li>
          ))}
          <li>
            <a href="/help/privacy">
              <strong>My personal data</strong>
              <span>See, correct or delete the information Katondo holds about you. No account needed.</span>
            </a>
          </li>
          <li>
            <a href="/help/recover">
              <strong>Can’t get into your account?</strong>
              <span>For when you can no longer use the email on your account. No sign-in needed.</span>
            </a>
          </li>
        </ul>
        <p className="help-note">To report a listing, shop or review, open it and choose <strong>Report</strong>. That tells us exactly what you mean.</p>
        <p className="help-note">Someone claiming to be from Katondo? <a href="/help/check-staff">Check their staff number</a>.</p>
      </section>

      <section className="help-mine" aria-labelledby="mine-heading">
        <h2 id="mine-heading">Your requests</h2>
        {!checked && <p className="help-muted">Loading…</p>}
        {checked && !user && (
          <div className="help-signin">
            <p>Sign in to follow your requests and reply to us.</p>
            <button className="button-primary" type="button" disabled={!signInAvailable} onClick={() => signIn('/help')}>Sign in</button>
          </div>
        )}
        {error && <p className="studio-message error" role="alert">{error}</p>}
        {user && cases && cases.length === 0 && <p className="help-muted">You haven’t opened any requests.</p>}
        {user && cases && cases.length > 0 && (
          <ul className="case-list">
            {cases.map((item) => (
              <li key={item.reference}>
                <a href={`/help/cases/${item.reference}`}>
                  <span className="case-top">
                    <span className="case-ref">{item.reference}</span>
                    <span className={`case-status status-${item.status}`}>{supportStatusLabels[item.status]}</span>
                  </span>
                  <strong>{item.summary}</strong>
                  <span className="case-foot">
                    <span className="help-muted">Updated {shortDate(item.updatedAt)}</span>
                    {item.unread > 0 && <span className="unread-badge" aria-label={`${item.unread} new ${item.unread === 1 ? 'reply' : 'replies'}`}>{item.unread}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
