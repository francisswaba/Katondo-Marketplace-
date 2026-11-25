'use client';

import { useState, type FormEvent } from 'react';
import {
  privacyRequestTypes,
  supportCategories,
  supportMessageMaxLength,
  supportReportReasons,
  supportSummaryMaxLength,
  type SupportCategory,
} from '@katondo/contracts';
import { useSignedInUser } from '../../../lib/useSignedInUser';

const placeholders: Partial<Record<SupportCategory, string>> = {
  order_problem: 'What did you order, what happened, and what would put it right? A refund, a replacement, or something else?',
  report_listing: 'What’s wrong with this listing? Include anything that helps us check, such as why you think it’s fake.',
  report_shop: 'What has this seller done? Include dates and what was said, if you can.',
  report_review: 'What’s wrong with this review? For example, it’s false, abusive or shares someone’s phone number.',
  account: 'What were you trying to do, and what happened instead?',
  seller_decision: 'Which decision do you disagree with, and why?',
  privacy_request: 'Which information is this about? For corrections, tell us what should change.',
  other: 'Tell us what happened.',
};

export default function NewCaseClient({ category: initialCategory, subjectId, subjectLabel }: { category: string | null; subjectId: string | null; subjectLabel: string | null }) {
  const { user, checked, api, signIn, signInAvailable } = useSignedInUser();
  const known = supportCategories.find((item) => item.id === initialCategory);
  const isReport = Boolean(known?.id.startsWith('report_'));
  const [category, setCategory] = useState<SupportCategory | ''>(known && (!isReport || subjectId) ? known.id : '');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [privacyType, setPrivacyType] = useState('');
  const [error, setError] = useState('');
  const [existing, setExisting] = useState('');
  const [sending, setSending] = useState(false);

  const chosen = supportCategories.find((item) => item.id === category);
  const reporting = Boolean(chosen?.id.startsWith('report_'));
  const choices = supportCategories.filter((item) => !item.id.startsWith('report_'));
  const returnTo = `/help/new?${new URLSearchParams({ ...(initialCategory ? { category: initialCategory } : {}), ...(subjectId ? { subject: subjectId } : {}), ...(subjectLabel ? { label: subjectLabel } : {}) })}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!category) { setError('Choose what your request is about.'); return; }
    setSending(true);
    setError('');
    setExisting('');
    try {
      const payload = await api<{ reference: string }>('/api/support/cases', {
        method: 'POST',
        body: {
          category, summary, details,
          ...(reporting || (category === 'order_problem' && subjectId) ? { subjectId } : {}),
          ...(reporting ? { reportReason } : {}),
          ...(category === 'privacy_request' ? { privacyRequestType: privacyType } : {}),
        },
      });
      window.location.assign(`/help/cases/${payload.reference}?new=1`);
    } catch (submitError) {
      const failure = submitError as Error & { payload?: { reference?: string } };
      setError(failure.message);
      if (failure.payload?.reference) setExisting(failure.payload.reference);
      setSending(false);
    }
  }

  if (!checked) return <p className="help-muted" role="status">Loading…</p>;

  if (!user) {
    return (
      <div className="help-form-wrap">
        <h1>{reporting ? chosen!.label : 'New request'}</h1>
        <p className="help-muted">Sign in so we can reply to you and you can follow your request.</p>
        <button className="button-primary" type="button" disabled={!signInAvailable} onClick={() => signIn(returnTo)}>Sign in</button>
        <p className="help-note">Asking about your personal data and don’t have an account? <a href="/help/privacy">Use the privacy request form</a>.</p>
      </div>
    );
  }

  return (
    <form className="help-form-wrap help-form" onSubmit={submit}>
      <a className="help-back" href="/help">Help and complaints</a>
      <h1>{reporting ? chosen!.label : 'New request'}</h1>
      {reporting && subjectLabel && <p className="help-subject">About: <strong>{subjectLabel}</strong></p>}
      {isReport && !subjectId && <p className="studio-message error">Open the listing, shop or review you want to report and use its Report link.</p>}

      {!reporting && (
        <fieldset className="help-choices">
          <legend>What is this about?</legend>
          {choices.map((item) => (
            <label key={item.id} className={category === item.id ? 'on' : undefined}>
              <input type="radio" name="category" value={item.id} checked={category === item.id} onChange={() => setCategory(item.id)} />
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
            </label>
          ))}
        </fieldset>
      )}

      {category === 'order_problem' && !subjectId && (
        <p className="help-note">Opening this from the order itself links it automatically. Until orders are switched on, include the item and seller below.</p>
      )}

      {reporting && (
        <label className="help-field">Why are you reporting this?
          <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} required>
            <option value="" disabled>Choose a reason</option>
            {supportReportReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.label}</option>)}
          </select>
        </label>
      )}

      {category === 'privacy_request' && (
        <label className="help-field">What would you like us to do?
          <select value={privacyType} onChange={(event) => setPrivacyType(event.target.value)} required>
            <option value="" disabled>Choose one</option>
            {privacyRequestTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
      )}

      {category && (
        <>
          <label className="help-field">Title
            <input value={summary} maxLength={supportSummaryMaxLength} onChange={(event) => setSummary(event.target.value)} placeholder="For example: Phone arrived with a cracked screen" required />
          </label>
          <label className="help-field">What happened?
            <textarea value={details} maxLength={supportMessageMaxLength} rows={7} onChange={(event) => setDetails(event.target.value)} placeholder={placeholders[category]} required />
            <small>{details.length.toLocaleString('en')} / {supportMessageMaxLength.toLocaleString('en')}</small>
          </label>
          <p className="help-note">Don’t include passwords, card numbers or PINs. Katondo will never ask for them.</p>
        </>
      )}

      {error && (
        <p className="studio-message error" role="alert">
          {error} {existing && <a href={`/help/cases/${existing}`}>Open {existing}</a>}
        </p>
      )}
      <button className="button-primary" type="submit" disabled={sending || !category || (isReport && !subjectId)}>{sending ? 'Sending…' : 'Send request'}</button>
    </form>
  );
}
