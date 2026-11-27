'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  supportAppealWindowDays,
  supportCategories,
  supportMessageMaxLength,
  supportStatusLabels,
  type SupportCaseDetail,
  type SupportStatus,
} from '@katondo/contracts';
import { useSignedInUser } from '../../../../lib/useSignedInUser';

const steps: SupportStatus[] = ['received', 'in_review', 'resolved'];

function when(value: string) {
  return new Date(value).toLocaleString('en-ZM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function CaseClient({ reference, justOpened }: { reference: string; justOpened: boolean }) {
  const { user, checked, api, signIn, signInAvailable } = useSignedInUser();
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [appeal, setAppeal] = useState('');
  const [appealOpen, setAppealOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setDetail(await api<SupportCaseDetail>(`/api/support/cases/${encodeURIComponent(reference)}`));
  }, [api, reference]);

  useEffect(() => {
    if (!user) return;
    load().catch((loadError: Error) => setError(loadError.message));
  }, [user, load]);

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      await api(`/api/support/cases/${reference}/messages`, { method: 'POST', body: { body: reply } });
      setReply('');
      await load();
    } catch (sendError) {
      setError((sendError as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function sendAppeal(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError('');
    try {
      const payload = await api<{ reference: string }>(`/api/support/cases/${reference}/appeal`, { method: 'POST', body: { reason: appeal } });
      window.location.assign(`/help/cases/${payload.reference}?new=1`);
    } catch (appealError) {
      setError((appealError as Error).message);
      setSending(false);
    }
  }

  if (!checked) return <p className="help-muted" role="status">Loading…</p>;
  if (!user) {
    return (
      <div className="help-form-wrap">
        <h1>{reference}</h1>
        <p className="help-muted">Sign in to see this request.</p>
        <button className="button-primary" type="button" disabled={!signInAvailable} onClick={() => signIn(`/help/cases/${reference}`)}>Sign in</button>
      </div>
    );
  }
  if (!detail) return <div className="help-form-wrap"><p className={error ? 'studio-message error' : 'help-muted'} role="status">{error || 'Loading your request…'}</p></div>;

  const category = supportCategories.find((item) => item.id === detail.category);
  const stepIndex = detail.status === 'waiting_on_requester' ? 1 : steps.indexOf(detail.status);

  return (
    <div className="help-form-wrap case-view">
      <a className="help-back" href="/help">Your requests</a>
      {justOpened && (
        <p className="studio-message success" role="status">
          {detail.isAppeal ? 'We’ll look at the decision again. A different person from the one who made it will handle this.' : 'Request sent. We’ll reply here, and you can add more details at any time.'}
        </p>
      )}
      <p className="case-ref-large">{detail.reference}</p>
      <h1>{detail.summary}</h1>
      <p className="help-muted">{category?.label}{detail.subjectLabel ? `: ${detail.subjectLabel}` : ''}</p>
      {detail.appealOfReference && <p className="help-note">This is a second look at <a href={`/help/cases/${detail.appealOfReference}`}>{detail.appealOfReference}</a>.</p>}

      <ol className="case-steps" aria-label="Progress">
        {steps.map((step, index) => (
          <li key={step} className={index < stepIndex ? 'done' : index === stepIndex ? 'current' : undefined} aria-current={index === stepIndex ? 'step' : undefined}>
            {index === 1 && detail.status === 'waiting_on_requester' ? supportStatusLabels.waiting_on_requester : supportStatusLabels[step]}
          </li>
        ))}
      </ol>

      {detail.status === 'waiting_on_requester' && <p className="studio-message">We need something from you to continue. See our latest message below.</p>}

      <ol className="case-thread">
        {detail.messages.map((message) => (
          <li key={message.id} className={`from-${message.author}`}>
            <span className="case-author">{message.author === 'you' ? 'You' : message.author === 'katondo' ? (message.staffLabel ? `${message.staffLabel}, Katondo` : 'Katondo') : 'Update'}<time dateTime={message.createdAt}>{when(message.createdAt)}</time></span>
            <p>{message.body}</p>
          </li>
        ))}
      </ol>

      {detail.canReply && (
        <form className="help-form" onSubmit={sendReply}>
          <label className="help-field">Add a message
            <textarea value={reply} maxLength={supportMessageMaxLength} rows={4} onChange={(event) => setReply(event.target.value)} />
          </label>
          {error && <p className="studio-message error" role="alert">{error}</p>}
          <button className="button-primary" type="submit" disabled={sending || reply.trim().length === 0}>{sending ? 'Sending…' : 'Send'}</button>
        </form>
      )}

      {detail.status === 'resolved' && detail.appealReference && (
        <p className="help-note">You asked for this decision to be looked at again in <a href={`/help/cases/${detail.appealReference}`}>{detail.appealReference}</a>.</p>
      )}

      {detail.canAppeal && !appealOpen && (
        <div className="case-appeal">
          <p>Disagree with this decision? You can ask for it to be looked at again by someone else, once, within {supportAppealWindowDays} days.</p>
          <button className="button-quiet" type="button" onClick={() => setAppealOpen(true)}>Ask for a second look</button>
        </div>
      )}
      {appealOpen && (
        <form className="help-form case-appeal" onSubmit={sendAppeal}>
          <label className="help-field">Why do you disagree?
            <textarea value={appeal} maxLength={supportMessageMaxLength} rows={5} onChange={(event) => setAppeal(event.target.value)} required />
          </label>
          {error && <p className="studio-message error" role="alert">{error}</p>}
          <div className="case-actions">
            <button className="button-primary" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Ask for a second look'}</button>
            <button className="button-quiet" type="button" onClick={() => setAppealOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
