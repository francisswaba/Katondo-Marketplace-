'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'oidc-client-ts';
import {
  messageFlagWarnings,
  messageMaxLength,
  type ConversationDetail,
  type ConversationSummary,
  type ListingResponse,
} from '@katondo/contracts';
import { apiUrl } from '../../lib/catalogue';
import { getUserManager, isCurrentUser } from '../../lib/oidc';

const quickStarts = ['Is this still available?', 'Can I see it in person?', 'Does the price include delivery?'];
const reportReasons = [
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'abuse', label: 'Abusive or threatening' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Something else' },
] as const;

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'Something went wrong. Try again.';
}

function timeLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString('en-ZM', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-ZM', { day: 'numeric', month: 'short' });
}

function ShieldIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"><path d="M12 3 5 6v6c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 8v5M12 16v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export default function MessagesClient({ conversationId, listingId }: { conversationId: string | null; listingId: string | null }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [inbox, setInbox] = useState<ConversationSummary[] | null>(null);
  const [thread, setThread] = useState<ConversationDetail | null>(null);
  const [newListing, setNewListing] = useState<ListingResponse['listing'] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  const [panel, setPanel] = useState<'none' | 'report'>('none');
  const [reportReason, setReportReason] = useState<string>('scam');
  const [reportDetails, setReportDetails] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const token = user?.access_token;
  const authed = useCallback((init?: RequestInit): RequestInit => ({
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  }), [token]);

  useEffect(() => {
    const manager = getUserManager();
    if (!manager) { setChecked(true); return; }
    manager.getUser().then((current) => setUser(isCurrentUser(current) ? current : null)).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);

  const loadInbox = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`${apiUrl}/api/conversations`, authed());
    if (!response.ok) throw new Error(await readError(response));
    setInbox((await response.json() as { conversations: ConversationSummary[] }).conversations);
  }, [token, authed]);

  const loadThread = useCallback(async (id: string) => {
    if (!token) return;
    const response = await fetch(`${apiUrl}/api/conversations/${encodeURIComponent(id)}`, authed());
    if (!response.ok) throw new Error(await readError(response));
    setThread(await response.json() as ConversationDetail);
  }, [token, authed]);

  // Inbox, refreshed every 30 seconds while the tab is visible.
  useEffect(() => {
    if (!token) return;
    loadInbox().catch((loadError: Error) => setError(loadError.message));
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadInbox().catch(() => undefined); }, 30_000);
    return () => window.clearInterval(timer);
  }, [token, loadInbox]);

  // Open conversation, refreshed every 10 seconds while the tab is visible.
  useEffect(() => {
    setThread(null);
    setPanel('none');
    setNotice('');
    if (!token || !conversationId) return;
    // Opening a conversation marks it read, so refresh the inbox and the header badge afterwards.
    loadThread(conversationId)
      .then(() => { void loadInbox().catch(() => undefined); window.dispatchEvent(new Event('katondo-messages-read')); })
      .catch((loadError: Error) => setError(loadError.message));
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadThread(conversationId).catch(() => undefined); }, 10_000);
    return () => window.clearInterval(timer);
  }, [token, conversationId, loadThread, loadInbox]);

  // Starting from a listing: open the existing conversation about it, or prepare a new one.
  useEffect(() => {
    if (!listingId || conversationId || !inbox) return;
    const existing = inbox.find((item) => item.listingId === listingId && item.role === 'buyer');
    if (existing) {
      router.replace(`/messages?c=${existing.id}`);
      return;
    }
    fetch(`${apiUrl}/api/listings/${encodeURIComponent(listingId)}`)
      .then(async (response) => response.ok ? (await response.json() as ListingResponse).listing : null)
      .then(setNewListing)
      .catch(() => setNewListing(null));
  }, [listingId, conversationId, inbox, router]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [thread?.messages.length]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    if (!body || !token || sending) return;
    setSending(true);
    setError('');
    try {
      if (thread) {
        const response = await fetch(`${apiUrl}/api/conversations/${thread.id}/messages`, authed({ method: 'POST', body: JSON.stringify({ body }) }));
        if (!response.ok) throw new Error(await readError(response));
        setDraft('');
        await Promise.all([loadThread(thread.id), loadInbox()]);
      } else if (newListing) {
        const response = await fetch(`${apiUrl}/api/listings/${newListing.id}/messages`, authed({ method: 'POST', body: JSON.stringify({ body }) }));
        if (!response.ok) throw new Error(await readError(response));
        const payload = await response.json() as { conversationId: string };
        setDraft('');
        await loadInbox();
        router.replace(`/messages?c=${payload.conversationId}`);
      }
    } catch (sendError) {
      setError((sendError as Error).message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  async function toggleBlock() {
    if (!thread || !token) return;
    const blocking = !thread.blockedByMe;
    if (blocking && !window.confirm(`Block ${thread.counterpartName}? Neither of you will be able to send messages until you unblock them.`)) return;
    const response = await fetch(`${apiUrl}/api/conversations/${thread.id}/block`, authed({ method: blocking ? 'POST' : 'DELETE' }));
    if (!response.ok) { setError(await readError(response)); return; }
    setNotice(blocking ? `${thread.counterpartName} is blocked.` : `${thread.counterpartName} is unblocked.`);
    await loadThread(thread.id);
  }

  async function sendReport(event: FormEvent) {
    event.preventDefault();
    if (!thread || !token) return;
    const response = await fetch(`${apiUrl}/api/conversations/${thread.id}/report`, authed({ method: 'POST', body: JSON.stringify({ reason: reportReason, details: reportDetails }) }));
    if (!response.ok) { setError(await readError(response)); return; }
    setPanel('none');
    setReportDetails('');
    setNotice('Thanks. Katondo’s team will review this conversation. You can also block this person.');
  }

  if (!checked) return <p className="messages-status" role="status">Loading…</p>;

  if (!user) {
    return (
      <div className="messages-off">
        <h1>Messages</h1>
        <p>Sign in to message sellers and see your conversations.</p>
        <button className="button-primary" type="button" disabled={!getUserManager()}
          onClick={() => getUserManager()?.signinRedirect({ state: { returnTo: `/messages${listingId ? `?listing=${listingId}` : conversationId ? `?c=${conversationId}` : ''}` } })}>
          Sign in
        </button>
      </div>
    );
  }

  const showingThread = Boolean(conversationId || (listingId && newListing));
  const listingLink = thread?.listingId ?? newListing?.id ?? null;
  const title = thread ? thread.counterpartName : newListing ? newListing.sellerName : '';
  const subtitle = thread ? thread.listingTitle : newListing?.title ?? '';

  return (
    <div className={`messages-layout${showingThread ? ' has-thread' : ''}`}>
      <section className="inbox" aria-labelledby="inbox-heading">
        <h1 id="inbox-heading">Messages</h1>
        {!inbox && !error && <p className="messages-status">Loading conversations…</p>}
        {inbox && inbox.length === 0 && <p className="messages-status">No conversations yet. Open a listing and choose “Message” to ask the seller a question.</p>}
        <ul>
          {inbox?.map((item) => (
            <li key={item.id}>
              <a href={`/messages?c=${item.id}`} aria-current={item.id === conversationId ? 'true' : undefined}
                onClick={(event) => { event.preventDefault(); router.push(`/messages?c=${item.id}`); }}>
                <span className="inbox-avatar" aria-hidden="true">{item.counterpartName.slice(0, 1)}</span>
                <span className="inbox-text">
                  <span className="inbox-top"><strong>{item.counterpartName}</strong><time dateTime={item.lastMessageAt}>{timeLabel(item.lastMessageAt)}</time></span>
                  <span className="inbox-listing">{item.listingTitle}</span>
                  <span className={`inbox-preview${item.unread ? ' unread' : ''}`}>{item.lastMessage ?? ''}</span>
                </span>
                {item.unread > 0 && <span className="unread-badge" aria-label={`${item.unread} unread`}>{item.unread}</span>}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="thread" aria-label={title ? `Conversation with ${title}` : 'Conversation'}>
        {!showingThread && <div className="thread-empty"><p>Choose a conversation.</p></div>}
        {showingThread && (
          <>
            <header className="thread-head">
              <button className="thread-back" type="button" aria-label="Back to conversations" onClick={() => router.push('/messages')}>‹</button>
              <div>
                <h2>{title || 'Conversation'}</h2>
                {listingLink ? <a href={`/listing/${listingLink}`}>{subtitle}</a> : <span>{subtitle}</span>}
              </div>
              {thread && (
                <div className="thread-tools">
                  <button type="button" onClick={() => setPanel(panel === 'report' ? 'none' : 'report')} aria-expanded={panel === 'report'}>Report</button>
                  <button type="button" onClick={toggleBlock}>{thread.blockedByMe ? 'Unblock' : 'Block'}</button>
                </div>
              )}
            </header>

            {panel === 'report' && thread && (
              <form className="report-form" onSubmit={sendReport}>
                <fieldset>
                  <legend>Why are you reporting this conversation?</legend>
                  {reportReasons.map((reason) => (
                    <label key={reason.id}><input type="radio" name="reason" value={reason.id} checked={reportReason === reason.id} onChange={() => setReportReason(reason.id)} />{reason.label}</label>
                  ))}
                </fieldset>
                <label>Anything else we should know? (optional)
                  <textarea value={reportDetails} maxLength={1000} rows={3} onChange={(event) => setReportDetails(event.target.value)} />
                </label>
                <p className="report-note">Katondo staff will be able to read this conversation to look into it.</p>
                <div><button className="button-primary" type="submit">Send report</button><button className="button-quiet" type="button" onClick={() => setPanel('none')}>Cancel</button></div>
              </form>
            )}

            <div className="thread-body" aria-live="polite">
              {!thread && newListing && (
                <div className="safety-card">
                  <ShieldIcon />
                  <p>Keep chatting and paying on Katondo. Never send a deposit by mobile money or bank transfer before you’ve seen the item.</p>
                </div>
              )}
              {thread?.messages.map((message) => (
                <div key={message.id} className={`bubble-row${message.mine ? ' mine' : ''}`}>
                  <div className={`bubble${message.removed ? ' removed' : ''}`}>
                    {message.removed ? 'Message removed by Katondo' : message.body}
                    <time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>
                  </div>
                  {message.flags.map((flag) => (
                    <p key={flag} className="bubble-warning"><ShieldIcon />{messageFlagWarnings[flag]}</p>
                  ))}
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {notice && <p className="studio-message success" role="status">{notice}</p>}
            {error && <p className="studio-message error" role="alert">{error}</p>}

            {thread?.closed
              ? <p className="thread-closed">{thread.blockedByMe ? `You blocked ${thread.counterpartName}. Unblock them to send messages.` : 'You can’t send messages in this conversation.'}</p>
              : (
                <form className="composer" onSubmit={send}>
                  {!thread && newListing && (
                    <div className="quick-starts">
                      {quickStarts.map((text) => <button key={text} type="button" onClick={() => setDraft(text)}>{text}</button>)}
                    </div>
                  )}
                  <label className="visually-hidden" htmlFor="composer">Message</label>
                  <textarea id="composer" value={draft} maxLength={messageMaxLength} rows={1} placeholder="Write a message"
                    onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} />
                  <button className="button-primary" type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button>
                  {draft.length > messageMaxLength - 200 && <small>{draft.length} / {messageMaxLength.toLocaleString('en')}</small>}
                </form>
              )}
          </>
        )}
      </section>
    </div>
  );
}
