'use client';

import { useCallback, useEffect, useState } from 'react';
import { privacyRequestTypes, supportCategories, supportReportReasons, supportStatusLabels, type SupportPriority, type SupportStatus } from '@katondo/contracts';

type QueueCase = {
  reference: string; category: string; summary: string; status: SupportStatus; priority: SupportPriority;
  createdAt: string; firstResponseDueAt: string; resolutionDueAt: string; firstResponseAt: string | null;
  isAppeal: boolean; subjectLabel: string | null; assigneeName: string | null; assignedToMe: boolean; overdue: boolean; requester: string;
  holdUntil: string | null; identityVerified: boolean;
};
type Recovery = {
  accountEmail: string; contactPhone: string | null; holdUntil: string; holdOver: boolean;
  identityVerifiedBy: string | null; identityVerifiedAt: string | null; identityEvidence: string | null; outcome: 'approved' | 'declined' | null;
  account: { found: false } | { found: true; status: string; createdAt: string; isStaff: boolean; shops: string[]; orders: number };
};
type CaseDetail = {
  reference: string; category: string; summary: string; status: SupportStatus; priority: SupportPriority;
  subjectType: string | null; subjectId: string | null; subjectLabel: string | null; reportReason: string | null; privacyRequestType: string | null;
  requester: { account: boolean; email: string | null; name?: string | null };
  assigneeName: string | null; resolution: string | null; createdAt: string; firstResponseDueAt: string; resolutionDueAt: string;
  firstResponseAt: string | null; appealOfReference: string | null; appealReference: string | null;
  messages: Array<{ id: string; author: 'requester' | 'staff' | 'system'; staffName: string | null; body: string; internal: boolean; createdAt: string }>;
  history: Array<{ event: string; details: Record<string, unknown>; actorName: string | null; createdAt: string }>;
  recovery: Recovery | null;
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const priorityLabels: Record<SupportPriority, string> = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
const eventLabels: Record<string, string> = {
  'support.case_opened': 'Opened', 'support.appeal_opened': 'Second look requested', 'support.replied': 'Replied to requester',
  'support.note_added': 'Internal note', 'support.assigned': 'Assigned', 'support.unassigned': 'Unassigned',
  'support.priority_changed': 'Priority changed', 'support.resolved': 'Decided', 'support.reopened': 'Reopened',
  'support.identity_verified': 'Identity check recorded',
};
const categoryLabel = (id: string) => supportCategories.find((item) => item.id === id)?.label ?? id;
const dateTime = (value: string) => new Date(value).toLocaleString('en-ZM', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function dueLabel(item: { status: SupportStatus; firstResponseAt: string | null; firstResponseDueAt: string; resolutionDueAt: string }) {
  if (item.status === 'resolved') return null;
  const due = item.firstResponseAt ? item.resolutionDueAt : item.firstResponseDueAt;
  const what = item.firstResponseAt ? 'Decision' : 'First reply';
  const hours = Math.round((new Date(due).getTime() - Date.now()) / 3_600_000);
  if (hours < 0) return `${what} overdue by ${Math.abs(hours) < 48 ? `${Math.abs(hours)}h` : `${Math.round(Math.abs(hours) / 24)}d`}`;
  return `${what} due in ${hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`}`;
}

export default function SupportQueuePanel({ token, canHandle }: { token: string; canHandle: boolean }) {
  const [view, setView] = useState<'open' | 'overdue' | 'mine' | 'resolved'>('open');
  const [queue, setQueue] = useState<QueueCase[]>([]);
  const [counts, setCounts] = useState({ open: 0, overdue: 0, unassigned: 0 });
  const [enabled, setEnabled] = useState(false);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const [waitForRequester, setWaitForRequester] = useState(false);
  const [resolution, setResolution] = useState('');
  const [priority, setPriority] = useState<SupportPriority>('normal');
  const [priorityReason, setPriorityReason] = useState('');
  const [notice, setNotice] = useState('');
  const [evidence, setEvidence] = useState('');
  const [outcome, setOutcome] = useState<'approved' | 'declined' | ''>('');
  const [busy, setBusy] = useState(false);

  const call = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok) throw new Error(payload?.error || 'The request could not be completed.');
    return payload as T;
  }, [token]);

  const loadQueue = useCallback(async () => {
    const payload = await call<{ enabled: boolean; counts: typeof counts; cases: QueueCase[] }>(`/api/admin/support/cases?view=${view}`);
    setQueue(payload.cases);
    setCounts(payload.counts);
    setEnabled(payload.enabled);
  }, [call, view]);

  const loadDetail = useCallback(async (reference: string) => {
    const payload = await call<CaseDetail>(`/api/admin/support/cases/${reference}`);
    setDetail(payload);
    setPriority(payload.priority);
  }, [call]);

  useEffect(() => { loadQueue().catch((error: Error) => setNotice(error.message)); }, [loadQueue]);

  async function open(reference: string) {
    if (openRef === reference) { setOpenRef(null); setDetail(null); return; }
    setOpenRef(reference);
    setDetail(null);
    setReply(''); setResolution(''); setPriorityReason(''); setInternal(false); setWaitForRequester(false); setEvidence(''); setOutcome('');
    await loadDetail(reference).catch((error: Error) => setNotice(error.message));
  }

  async function act(path: string, body: unknown, done: string) {
    if (!detail) return;
    setBusy(true);
    setNotice('');
    try {
      await call(`/api/admin/support/cases/${detail.reference}/${path}`, body);
      setNotice(done);
      await Promise.all([loadDetail(detail.reference), loadQueue()]);
      setReply(''); setResolution(''); setPriorityReason('');
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section support-queue">
      <div className="admin-section-title">
        <div><p className="eyebrow">Trust and safety</p><h2>Help and complaints</h2></div>
        <span>{enabled ? 'Open to buyers and sellers' : 'Switched off until sign-in is live'}</span>
      </div>
      <div className="metric-grid support-metrics">
        <article><strong>{counts.open}</strong><span>Open</span></article>
        <article className={counts.overdue ? 'is-late' : undefined}><strong>{counts.overdue}</strong><span>Overdue</span></article>
        <article><strong>{counts.unassigned}</strong><span>Not assigned</span></article>
      </div>
      <div className="review-actions" style={{ marginTop: 18, marginBottom: 18, gridTemplateColumns: 'auto' }}>
        <div>
          {(['open', 'overdue', 'mine', 'resolved'] as const).map((item) => (
            <button key={item} type="button" aria-pressed={view === item} onClick={() => { setView(item); setOpenRef(null); }}>
              {{ open: 'All open', overdue: 'Overdue', mine: 'Assigned to me', resolved: 'Resolved' }[item]}
            </button>
          ))}
        </div>
      </div>
      {notice && <p className="admin-notice">{notice}</p>}

      <div className="support-rows">
        {queue.map((item) => (
          <article key={item.reference} className={`support-row${item.overdue ? ' late' : ''}${openRef === item.reference ? ' open' : ''}`}>
            <button type="button" className="support-row-head" aria-expanded={openRef === item.reference} onClick={() => open(item.reference)}>
              <span className={`prio prio-${item.priority}`}>{priorityLabels[item.priority]}</span>
              <span className="support-row-main">
                <strong>{item.summary}</strong>
                <small>{item.reference}, {categoryLabel(item.category)}{item.isAppeal ? ', second look' : ''}{item.subjectLabel ? `: ${item.subjectLabel}` : ''}</small>
              </span>
              <span className="support-row-side">
                <span>{supportStatusLabels[item.status]}</span>
                <small className={item.overdue ? 'late-text' : undefined}>{dueLabel(item) ?? `Opened ${dateTime(item.createdAt)}`}</small>
                {item.holdUntil && item.status !== 'resolved' && new Date(item.holdUntil).getTime() > Date.now() && <small>On hold until {dateTime(item.holdUntil)}</small>}
                <small>{item.assigneeName ? (item.assignedToMe ? 'You' : item.assigneeName) : 'Not assigned'}</small>
              </span>
            </button>

            {openRef === item.reference && detail && (
              <div className="support-detail">
                <dl>
                  <div><dt>Requester</dt><dd>{detail.requester.account ? `Signed-in user${detail.requester.email ? `, ${detail.requester.email}` : ''}` : `${detail.requester.name} (no account), ${detail.requester.email}`}</dd></div>
                  {detail.reportReason && <div><dt>Reason</dt><dd>{supportReportReasons.find((r) => r.id === detail.reportReason)?.label}</dd></div>}
                  {detail.privacyRequestType && <div><dt>Request</dt><dd>{privacyRequestTypes.find((r) => r.id === detail.privacyRequestType)?.label}</dd></div>}
                  {detail.subjectType && detail.subjectId && (
                    <div><dt>About</dt><dd>
                      {detail.subjectType === 'listing' ? <a href={`/listing/${detail.subjectId}`} target="_blank" rel="noreferrer">{detail.subjectLabel}</a>
                        : detail.subjectType === 'seller' ? <a href={`/shop/${detail.subjectId}`} target="_blank" rel="noreferrer">{detail.subjectLabel}</a>
                          : detail.subjectLabel}
                    </dd></div>
                  )}
                  <div><dt>First reply due</dt><dd>{detail.firstResponseAt ? `Replied ${dateTime(detail.firstResponseAt)}` : dateTime(detail.firstResponseDueAt)}</dd></div>
                  <div><dt>Decision due</dt><dd>{dateTime(detail.resolutionDueAt)}</dd></div>
                  {detail.appealOfReference && <div><dt>Second look at</dt><dd>{detail.appealOfReference}</dd></div>}
                  {detail.appealReference && <div><dt>Second look in</dt><dd>{detail.appealReference}</dd></div>}
                </dl>

                {detail.recovery && (
                  <div className="recovery-box">
                    <h4>Account recovery</h4>
                    <dl>
                      <div><dt>Email they can’t use</dt><dd>{detail.recovery.accountEmail}</dd></div>
                      <div><dt>New contact email</dt><dd>{detail.requester.email}</dd></div>
                      {detail.recovery.contactPhone && <div><dt>Phone</dt><dd>{detail.recovery.contactPhone}</dd></div>}
                      <div><dt>Matching Katondo account</dt><dd>{detail.recovery.account.found
                        ? `Yes: joined ${dateTime(detail.recovery.account.createdAt)}, ${detail.recovery.account.orders} order${detail.recovery.account.orders === 1 ? '' : 's'}${detail.recovery.account.shops.length ? `, shop: ${detail.recovery.account.shops.join(', ')}` : ''}${detail.recovery.account.isStaff ? '. This is a STAFF account: a top administrator must handle it.' : ''}`
                        : 'No account uses this email. Decline unless they can show otherwise.'}</dd></div>
                      <div><dt>Hold</dt><dd>{detail.recovery.holdOver ? 'Over: a decision can be made' : `No approval before ${dateTime(detail.recovery.holdUntil)}`}</dd></div>
                      <div><dt>Identity check</dt><dd>{detail.recovery.identityVerifiedBy ? `Recorded by ${detail.recovery.identityVerifiedBy}` : 'Not yet recorded'}</dd></div>
                    </dl>
                    {detail.recovery.identityEvidence && <p className="section-copy" style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}><strong>How identity was checked:</strong> {detail.recovery.identityEvidence}</p>}
                    <ol className="recovery-steps">
                      <li>Contact them at the new email (and phone, if given). Ask things only the real owner would know: recent orders, delivery area, shop details, who they messaged. Never ask for a password or PIN.</li>
                      <li>Record how you checked their identity below. A <strong>different</strong> staff member must then approve or decline.</li>
                      <li>If approved: in Microsoft Entra, open the person (Users), change their sign-in email to the new address, and tell them to use <strong>Forgot password?</strong> to set a new password.</li>
                    </ol>
                    {canHandle && detail.status !== 'resolved' && !detail.recovery.identityVerifiedBy && (
                      <div className="support-actions">
                        <label>How did you check it’s really them?
                          <textarea value={evidence} maxLength={2000} onChange={(event) => setEvidence(event.target.value)} placeholder="For example: confirmed their last order, the shop name and delivery area by phone." />
                        </label>
                        <div><button type="button" disabled={busy || evidence.trim().length < 20} onClick={() => act('verify-identity', { evidence }, 'Identity check recorded. A different staff member must now decide.')}>Record identity check</button></div>
                      </div>
                    )}
                  </div>
                )}

                {!detail.requester.account && <p className="admin-notice">This person has no account. Replies here are recorded, but you must also send them by email to {detail.requester.email}. Confirm their identity before sharing or changing any data.</p>}

                <ol className="staff-thread">
                  {detail.messages.map((message) => (
                    <li key={message.id} className={message.internal ? 'internal' : undefined}>
                      <span>{message.author === 'requester' ? 'Requester' : message.author === 'system' ? 'Update' : `${message.staffName ?? 'Staff'}${message.internal ? ' (internal note)' : ''}`}, {dateTime(message.createdAt)}</span>
                      <p>{message.body}</p>
                    </li>
                  ))}
                </ol>

                {canHandle && detail.status !== 'resolved' && (
                  <div className="support-actions">
                    <div className="support-assign">
                      <button type="button" disabled={busy} onClick={() => act('assign', { assignee: 'me' }, 'Assigned to you.')}>Assign to me</button>
                      {detail.assigneeName && <button type="button" disabled={busy} onClick={() => act('assign', { assignee: 'none' }, 'Unassigned.')}>Unassign</button>}
                    </div>
                    <label>{internal ? 'Internal note (the requester won’t see this)' : 'Reply to the requester'}
                      <textarea value={reply} maxLength={4000} onChange={(event) => setReply(event.target.value)} />
                    </label>
                    <div className="support-checks">
                      <label><input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} /> Internal note</label>
                      {!internal && <label><input type="checkbox" checked={waitForRequester} onChange={(event) => setWaitForRequester(event.target.checked)} /> Waiting for their reply</label>}
                      <button type="button" disabled={busy || !reply.trim()} onClick={() => act('messages', { body: reply, internal, waitForRequester: !internal && waitForRequester }, internal ? 'Note added.' : 'Reply sent.')}>
                        {internal ? 'Add note' : 'Send reply'}
                      </button>
                    </div>
                    <div className="support-priority">
                      <label>Priority
                        <select value={priority} onChange={(event) => setPriority(event.target.value as SupportPriority)}>
                          {Object.entries(priorityLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      </label>
                      <label>Reason for change<input value={priorityReason} maxLength={500} onChange={(event) => setPriorityReason(event.target.value)} /></label>
                      <button type="button" disabled={busy || priority === detail.priority} onClick={() => act('priority', { priority, reason: priorityReason }, 'Priority changed.')}>Change</button>
                    </div>
                    {detail.recovery && (
                      <fieldset className="recovery-outcome">
                        <legend>Recovery decision</legend>
                        <label><input type="radio" name="outcome" checked={outcome === 'approved'} onChange={() => setOutcome('approved')} /> Approve: I’ve moved the account to the new email in Entra</label>
                        <label><input type="radio" name="outcome" checked={outcome === 'declined'} onChange={() => setOutcome('declined')} /> Decline</label>
                      </fieldset>
                    )}
                    <label>Decision (shown to the requester)
                      <textarea value={resolution} maxLength={2000} onChange={(event) => setResolution(event.target.value)} placeholder="What you decided, and why. If they disagree, they can ask for a second look." />
                    </label>
                    <div><button type="button" className="resolve-button" disabled={busy || resolution.trim().length < 10 || Boolean(detail.recovery && !outcome)} onClick={() => act('resolve', { resolution, ...(detail.recovery ? { outcome } : {}) }, 'Case resolved.')}>Resolve with this decision</button></div>
                  </div>
                )}
                {canHandle && detail.status === 'resolved' && !detail.appealReference && (
                  <div className="support-actions">
                    <p className="section-copy" style={{ margin: 0 }}><strong>Decision:</strong> {detail.resolution}</p>
                    <div><button type="button" disabled={busy} onClick={() => { const reason = window.prompt('Why are you reopening this case?'); if (reason) void act('reopen', { reason }, 'Case reopened.'); }}>Reopen</button></div>
                  </div>
                )}

                <details className="support-history">
                  <summary>History ({detail.history.length})</summary>
                  <ol>
                    {detail.history.map((event, index) => (
                      <li key={index}>{dateTime(event.createdAt)}: {eventLabels[event.event] ?? event.event}{event.actorName ? ` by ${event.actorName}` : ''}{typeof event.details?.reason === 'string' ? ` (${event.details.reason})` : ''}</li>
                    ))}
                  </ol>
                </details>
              </div>
            )}
          </article>
        ))}
        {queue.length === 0 && <div className="admin-empty">{view === 'resolved' ? 'No resolved cases yet.' : view === 'overdue' ? 'Nothing overdue.' : view === 'mine' ? 'Nothing assigned to you.' : 'No open cases.'}</div>}
      </div>
    </section>
  );
}
