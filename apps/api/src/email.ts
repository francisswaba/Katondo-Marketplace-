import { EmailClient } from '@azure/communication-email';
import type { Pool, PoolClient } from 'pg';

/**
 * Email notifications.
 *
 * queueEmail() stores an email in email_outbox (only while email is switched on). A background
 * worker sends queued emails through Azure Communication Services and retries failures. Templates
 * are rendered at send time from small parameter sets, and sent rows are deleted after 30 days.
 *
 * Variables: EMAIL_ENABLED=true, EMAIL_PROVIDER=acs (or log, for local testing only),
 * ACS_CONNECTION_STRING (secret), EMAIL_FROM (e.g. DoNotReply@mail.katondo.zm), EMAIL_REPLY_TO,
 * PUBLIC_WEB_URL (e.g. https://katondo.netlify.app).
 */

type Database = Pool | PoolClient;
type Params = Record<string, string | number | null | undefined>;

/** Who may switch an email off. Essential emails (security, help cases, account changes) always send. */
type Preference = 'message_emails' | 'order_updates' | 'seller_activity_alerts';

export type EmailTemplate =
  | 'support_reply' | 'support_resolved'
  | 'support_received_anonymous' | 'support_reply_anonymous' | 'support_resolved_anonymous'
  | 'recovery_received' | 'recovery_alert_old_email'
  | 'new_message'
  | 'account_closing' | 'account_restored'
  | 'seller_application_received' | 'seller_application_rejected';

const provider = () => (process.env.EMAIL_PROVIDER || 'acs').toLowerCase();

export function emailEnabled() {
  if (process.env.EMAIL_ENABLED !== 'true') return false;
  if (provider() === 'log') return process.env.NODE_ENV !== 'production';
  return provider() === 'acs' && Boolean(process.env.ACS_CONNECTION_STRING && process.env.EMAIL_FROM);
}

const webUrl = () => (process.env.PUBLIC_WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Queues an email. Never throws: a notification failing must not break the action that caused it. */
export async function queueEmail(database: Database, input: {
  to: string | null | undefined;
  template: EmailTemplate;
  params?: Params;
  userId?: string | null;
  preference?: Preference;
  /** Skip if an email with the same key was queued within this many minutes. */
  dedupe?: { key: string; minutes: number };
}) {
  try {
    if (!emailEnabled() || !input.to || !emailPattern.test(input.to)) return false;
    if (input.preference && input.userId) {
      const pref = await database.query(`SELECT ${input.preference} AS allowed FROM user_preferences WHERE user_id = $1`, [input.userId]);
      if (pref.rows[0] && pref.rows[0].allowed === false) return false;
    }
    if (input.dedupe) {
      const recent = await database.query(
        `SELECT 1 FROM email_outbox WHERE dedupe_key = $1 AND created_at > NOW() - make_interval(mins => $2) LIMIT 1`,
        [input.dedupe.key, input.dedupe.minutes],
      );
      if (recent.rowCount) return false;
    }
    await database.query(`
      INSERT INTO email_outbox (to_address, user_id, template, params, dedupe_key)
      VALUES ($1, $2, $3, $4, $5)
    `, [input.to.trim(), input.userId ?? null, input.template, JSON.stringify(input.params ?? {}), input.dedupe?.key ?? null]);
    return true;
  } catch (error) {
    console.error('Email could not be queued', (error as Error).message);
    return false;
  }
}

/* ---------- Templates ---------- */

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const firstName = (value: unknown) => text(value).trim().split(/\s+/)[0] || 'there';
const date = (value: unknown) => {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleString('en-ZM', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Lusaka' });
};

type Block = { p: string } | { button: { label: string; href: string } } | { quote: string };
type Rendered = { subject: string; blocks: Block[]; optional?: boolean };

function compose(template: EmailTemplate, params: Params): Rendered {
  const name = firstName(params.name);
  const ref = text(params.reference);
  const caseLink = `${webUrl()}/help/cases/${encodeURIComponent(ref)}`;
  switch (template) {
    case 'support_reply':
      return { subject: `Katondo replied to your request ${ref}`, blocks: [
        { p: `Hi ${name},` },
        { p: `${text(params.staffLabel) || 'Katondo'} replied to your request “${text(params.summary)}” (${ref}).` },
        { button: { label: 'Read and reply', href: caseLink } },
      ] };
    case 'support_resolved':
      return { subject: `We’ve made a decision on ${ref}`, blocks: [
        { p: `Hi ${name},` },
        { p: `We’ve made a decision on your request “${text(params.summary)}” (${ref}). If you disagree, you can ask for a second look by a different member of staff.` },
        { button: { label: 'See the decision', href: caseLink } },
      ] };
    case 'support_received_anonymous':
      return { subject: `We received your request ${ref}`, blocks: [
        { p: `Hi ${name},` },
        { p: `We received your request about your personal information. Your reference is ${ref}.` },
        { p: `We’ll reply to this email address within ${text(params.days) || '30'} days. We may first ask you to confirm who you are.` },
      ] };
    case 'support_reply_anonymous':
      return { subject: `About your request ${ref}`, blocks: [
        { p: `Hi ${name},` },
        { p: `${text(params.staffLabel) || 'Katondo'} replied about your request ${ref}:` },
        { quote: text(params.body) },
        { p: `To answer, reply to this email and keep ${ref} in the subject.` },
      ] };
    case 'support_resolved_anonymous':
      return { subject: `Decision on your request ${ref}`, blocks: [
        { p: `Hi ${name},` },
        { p: `We’ve made a decision on your request ${ref}:` },
        { quote: text(params.body) },
        { p: `If you disagree, reply to this email and keep ${ref} in the subject.` },
      ] };
    case 'recovery_received':
      return { subject: `We received your account recovery request ${ref}`, blocks: [
        { p: `Hi ${name},` },
        { p: `We received your request to recover your Katondo account. Your reference is ${ref}.` },
        { p: `To protect you, we wait at least ${text(params.holdHours) || '72'} hours before moving an account to a new email address, and two members of staff check every request. Someone from Katondo will contact you at this address. They’ll show their staff number, which you can check on Katondo’s Help page.` },
        { p: 'Katondo staff will never ask for your password.' },
      ] };
    case 'recovery_alert_old_email':
      return { subject: 'Someone asked to move your Katondo account', blocks: [
        { p: `Hi ${name},` },
        { p: `Someone has asked Katondo to move your account to a different email address, saying they can no longer use this one (reference ${ref}).` },
        { p: 'If that was you, you don’t need to do anything.' },
        { p: `If it wasn’t you, tell us before ${date(params.holdUntil)}: reply to this email, or sign in and open a help request. Your account stays as it is while we check.` },
        { button: { label: 'Open a help request', href: `${webUrl()}/help/new?category=account` } },
      ] };
    case 'new_message':
      return { optional: true, subject: `New message from ${firstName(params.senderName)} about ${text(params.listingTitle)}`, blocks: [
        { p: `Hi ${name},` },
        { p: `${firstName(params.senderName)} sent you a message about “${text(params.listingTitle)}”.` },
        { button: { label: 'Read and reply', href: `${webUrl()}/messages?c=${encodeURIComponent(text(params.conversationId))}` } },
        { p: 'Keep payments and personal details on Katondo until you’re sure the other person and the item are real.' },
      ] };
    case 'account_closing':
      return { subject: 'Your Katondo account is closing', blocks: [
        { p: `Hi ${name},` },
        { p: 'You asked us to close your Katondo account. Your profile, shop and listings are now hidden.' },
        { p: `If you change your mind, sign in and choose Restore my account before ${date(params.dueAt)}. After that we permanently remove your details.` },
        { button: { label: 'Restore my account', href: `${webUrl()}/account` } },
        { p: 'If you didn’t ask for this, sign in and restore your account straight away, then change your password.' },
      ] };
    case 'account_restored':
      return { subject: 'Welcome back to Katondo', blocks: [
        { p: `Hi ${name},` },
        { p: 'Your Katondo account is restored. Your profile, shop and listings are visible again.' },
        { p: 'If you didn’t do this, open a help request straight away.' },
      ] };
    case 'seller_application_received':
      return { subject: 'We received your seller application', blocks: [
        { p: `Hi ${name},` },
        { p: `Thanks for applying to sell on Katondo as “${text(params.shopName)}”. We check every application before a shop can go live, and we’ll email you when we’ve decided.` },
        { button: { label: 'Check your application', href: `${webUrl()}/sell` } },
      ] };
    case 'seller_application_rejected':
      return { subject: 'About your seller application', blocks: [
        { p: `Hi ${name},` },
        { p: `We can’t approve your application to sell as “${text(params.shopName)}” at the moment.` },
        { quote: text(params.reason) },
        { p: 'If you think we got this wrong, open a help request and choose “A decision about my shop”. A different member of staff will look again.' },
        { button: { label: 'Open a help request', href: `${webUrl()}/help/new?category=seller_decision` } },
      ] };
  }
}

const footerText = (optional?: boolean) => [
  'Katondo staff will never ask for your password, PIN or card number.',
  optional ? `Choose which emails you get: ${webUrl()}/account` : '',
  'Katondo.zm Marketplace, No. 8 Elm Road, Woodlands, Lusaka, Zambia.',
].filter(Boolean).join('\n');

export function renderEmail(template: EmailTemplate, params: Params) {
  const { subject, blocks, optional } = compose(template, params);
  const plainText = [
    ...blocks.map((block) => 'p' in block ? block.p : 'quote' in block ? block.quote.split('\n').map((line) => `> ${line}`).join('\n') : `${block.button.label}: ${block.button.href}`),
    '—',
    footerText(optional),
  ].join('\n\n');
  const body = blocks.map((block) => {
    if ('p' in block) return `<p style="margin:0 0 16px">${escapeHtml(block.p)}</p>`;
    if ('quote' in block) return `<div style="margin:0 0 16px;padding:14px 16px;border-left:3px solid #0f7a55;background:#f1f6f3;border-radius:6px;white-space:pre-wrap">${escapeHtml(block.quote)}</div>`;
    return `<p style="margin:8px 0 20px"><a href="${escapeHtml(block.button.href)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0f7a55;color:#ffffff;font-weight:600;text-decoration:none">${escapeHtml(block.button.label)}</a></p>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#10231a;font-size:16px;line-height:1.55">
<div style="max-width:520px;margin:0 auto">
<p style="margin:0 0 18px;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#0f7a55">katondo<span style="color:#f2631c">•</span></p>
<div style="background:#ffffff;border:1px solid #dfe7e2;border-radius:16px;padding:28px 24px">${body}</div>
<p style="margin:18px 4px 0;font-size:12px;line-height:1.6;color:#5d6f66">${footerText(optional).split('\n').map((line) => escapeHtml(line).replace(/(https?:\/\/\S+)/g, '<a href="$1" style="color:#0f7a55">$1</a>')).join('<br>')}</p>
</div></body></html>`;
  return { subject, plainText, html };
}

/* ---------- Sending ---------- */

let acsClient: EmailClient | null = null;

async function send(to: string, rendered: ReturnType<typeof renderEmail>): Promise<string> {
  if (provider() === 'log') {
    const [user, domain] = to.split('@');
    console.log(`[email] ${rendered.subject} → ${user.slice(0, 2)}***@${domain}`);
    return `log-${Date.now()}`;
  }
  acsClient ??= new EmailClient(process.env.ACS_CONNECTION_STRING!);
  const replyTo = process.env.EMAIL_REPLY_TO;
  const poller = await acsClient.beginSend({
    senderAddress: process.env.EMAIL_FROM!,
    content: { subject: rendered.subject, plainText: rendered.plainText, html: rendered.html },
    recipients: { to: [{ address: to }] },
    ...(replyTo ? { replyTo: [{ address: replyTo }] } : {}),
    disableUserEngagementTracking: true,
  });
  const result = await poller.pollUntilDone();
  if (result.status !== 'Succeeded') throw new Error(`Email provider status ${result.status}${result.error?.message ? `: ${result.error.message}` : ''}`);
  return result.id;
}

const retryMinutes = [1, 5, 15, 60, 180];

/** Sends due emails. Safe to run on several servers at once (rows are locked while sending). */
export async function sendDueEmails(pool: Pool, batchSize = 10) {
  if (!emailEnabled()) return 0;
  // Rows stuck in "sending" (for example after a restart) go back in the queue.
  await pool.query(`UPDATE email_outbox SET status = 'queued' WHERE status = 'sending' AND locked_at < NOW() - INTERVAL '10 minutes'`);
  const claimed = await pool.query(`
    UPDATE email_outbox SET status = 'sending', attempts = attempts + 1, locked_at = NOW()
    WHERE id IN (
      SELECT id FROM email_outbox WHERE status = 'queued' AND next_attempt_at <= NOW()
      ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, to_address, template, params, attempts
  `, [batchSize]);
  let sent = 0;
  for (const row of claimed.rows) {
    try {
      const messageId = await send(row.to_address, renderEmail(row.template, row.params ?? {}));
      await pool.query(`UPDATE email_outbox SET status = 'sent', sent_at = NOW(), provider_message_id = $2, last_error = NULL, locked_at = NULL WHERE id = $1`, [row.id, messageId]);
      sent += 1;
    } catch (error) {
      const message = String((error as Error).message || error).slice(0, 500);
      const giveUp = row.attempts > retryMinutes.length;
      await pool.query(`
        UPDATE email_outbox SET status = $2, last_error = $3, locked_at = NULL,
          next_attempt_at = NOW() + make_interval(mins => $4)
        WHERE id = $1
      `, [row.id, giveUp ? 'failed' : 'queued', message, retryMinutes[Math.min(row.attempts - 1, retryMinutes.length - 1)]]);
      console.error(`Email ${row.id} failed (attempt ${row.attempts})`, message);
    }
  }
  return sent;
}

/** Sent emails are deleted after 30 days, failed and cancelled ones after 90. */
export async function purgeOldEmails(pool: Pool) {
  const result = await pool.query(`
    DELETE FROM email_outbox
    WHERE (status = 'sent' AND created_at < NOW() - INTERVAL '30 days')
       OR (status IN ('failed', 'cancelled') AND created_at < NOW() - INTERVAL '90 days')
  `);
  return result.rowCount ?? 0;
}

/** Starts the background sender. */
export function startEmailWorker(pool: Pool) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      while ((await sendDueEmails(pool)) === 10) { /* keep going while there's a backlog */ }
    } catch (error) {
      console.error('Email worker failed', (error as Error).message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, Number(process.env.EMAIL_WORKER_INTERVAL_MS) || 20_000).unref();
  setInterval(() => { purgeOldEmails(pool).catch(() => undefined); }, 24 * 3_600_000).unref();
  void purgeOldEmails(pool).catch(() => undefined);
  if (emailEnabled()) console.log(`Email notifications on (${provider()}).`);
}
