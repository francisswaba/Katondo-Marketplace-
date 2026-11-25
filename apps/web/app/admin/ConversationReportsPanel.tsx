'use client';

import { useEffect, useState } from 'react';

type Report = {
  id: string;
  conversation_id: string;
  reason: 'scam' | 'abuse' | 'spam' | 'other';
  details: string | null;
  status: 'open' | 'resolved';
  resolution_note: string | null;
  created_at: string;
  reported_by: 'buyer' | 'seller';
  listing_title: string;
  seller_name: string;
  buyer_display_name: string;
};

type StaffMessage = {
  id: string;
  sender_role: 'buyer' | 'seller';
  body: string;
  flags: string[];
  status: 'visible' | 'removed';
  removed_reason: string | null;
  created_at: string;
};

const reasonLabels: Record<Report['reason'], string> = { scam: 'Scam or fraud', abuse: 'Abusive or threatening', spam: 'Spam', other: 'Something else' };
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'The request could not be completed.';
}

export default function ConversationReportsPanel({ token }: { token: string }) {
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const [reports, setReports] = useState<Report[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const headers = (body?: unknown): RequestInit => ({
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  useEffect(() => {
    let active = true;
    setOpenReport(null);
    fetch(`${apiUrl}/api/admin/conversation-reports?status=${status}`, headers())
      .then(async (response) => { if (!response.ok) throw new Error(await readError(response)); return response.json() as Promise<{ enabled: boolean; reports: Report[] }>; })
      .then((payload) => { if (active) { setReports(payload.reports); setEnabled(payload.enabled); } })
      .catch((error: Error) => active && setMessage(error.message));
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status]);

  async function readConversation(report: Report) {
    setBusy(report.id);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/admin/conversation-reports/${report.id}`, headers());
      if (!response.ok) throw new Error(await readError(response));
      setMessages((await response.json() as { messages: StaffMessage[] }).messages);
      setOpenReport(report.id);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function removeMessage(item: StaffMessage) {
    const reason = window.prompt('Why are you removing this message? This is kept in the audit history.');
    if (!reason) return;
    const response = await fetch(`${apiUrl}/api/admin/messages/${item.id}/remove`, headers({ reason }));
    if (!response.ok) { setMessage(await readError(response)); return; }
    setMessages((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'removed', removed_reason: reason } : entry));
    setMessage('Message removed. Both people now see “Message removed by Katondo”.');
  }

  async function resolve(report: Report) {
    const note = notes[report.id]?.trim() || '';
    if (note.length < 3) { setMessage('Add a note of at least three characters explaining what you did.'); return; }
    setBusy(report.id);
    const response = await fetch(`${apiUrl}/api/admin/conversation-reports/${report.id}/resolve`, headers({ note }));
    setBusy('');
    if (!response.ok) { setMessage(await readError(response)); return; }
    setReports((current) => current.filter((item) => item.id !== report.id));
    setOpenReport(null);
    setMessage('Report resolved.');
  }

  return (
    <section className="admin-section">
      <div className="admin-section-title">
        <div><p className="eyebrow">Trust and safety</p><h2>Reported conversations</h2></div>
        <span>{enabled ? 'Messaging is on' : 'Messaging is switched off'}</span>
      </div>
      <p className="section-copy">Conversations are private. You can read one only when someone has reported it, and every time you open it is recorded in the audit history.</p>
      <div className="review-actions" style={{ marginTop: 0, marginBottom: 18, gridTemplateColumns: 'auto' }}>
        <div>
          <button type="button" aria-pressed={status === 'open'} onClick={() => setStatus('open')}>Open</button>
          <button type="button" aria-pressed={status === 'resolved'} onClick={() => setStatus('resolved')}>Resolved</button>
        </div>
      </div>
      {message && <p className="admin-notice">{message}</p>}
      <div className="application-table">
        {reports.map((report) => (
          <article className="review-card" key={report.id}>
            <div className="review-card-head">
              <div>
                <span>Reported by the {report.reported_by} · {new Date(report.created_at).toLocaleString('en-ZM')}</span>
                <h3>{reasonLabels[report.reason]}: {report.listing_title}</h3>
                <p>{report.seller_name} and {report.buyer_display_name}</p>
              </div>
              <strong>{report.status === 'open' ? 'Open' : 'Resolved'}</strong>
            </div>
            {report.details && <p className="section-copy" style={{ margin: '14px 0 0' }}>“{report.details}”</p>}
            {report.resolution_note && <p className="section-copy" style={{ margin: '10px 0 0' }}><strong>Resolution:</strong> {report.resolution_note}</p>}

            {openReport === report.id ? (
              <ol className="staff-thread">
                {messages.map((item) => (
                  <li key={item.id} className={item.status === 'removed' ? 'removed' : undefined}>
                    <span>{item.sender_role === 'buyer' ? report.buyer_display_name : report.seller_name} · {new Date(item.created_at).toLocaleString('en-ZM')}{item.flags.length ? ` · flagged: ${item.flags.join(', ').replaceAll('_', ' ')}` : ''}</span>
                    <p>{item.body}</p>
                    {item.status === 'removed'
                      ? <small>Removed: {item.removed_reason}</small>
                      : report.status === 'open' && <button type="button" className="danger-button" onClick={() => removeMessage(item)}>Remove message</button>}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="review-actions" style={{ gridTemplateColumns: 'auto' }}>
                <div><button type="button" disabled={busy === report.id} onClick={() => readConversation(report)}>Read conversation (audited)</button></div>
              </div>
            )}

            {report.status === 'open' && (
              <div className="review-actions">
                <label>What did you do?
                  <textarea value={notes[report.id] || ''} maxLength={500} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} />
                </label>
                <div><button type="button" disabled={busy === report.id} onClick={() => resolve(report)}>Resolve report</button></div>
              </div>
            )}
          </article>
        ))}
        {reports.length === 0 && <div className="admin-empty">{status === 'open' ? 'No open reports.' : 'No resolved reports yet.'}</div>}
      </div>
    </section>
  );
}
