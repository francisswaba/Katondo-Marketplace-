'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';
import { getUserManager, isCurrentUser, isOidcConfigured } from '../../lib/oidc';
import ReleaseControlsPanel from './ReleaseControlsPanel';

type Capabilities = {
  accessWorkspace: boolean;
  viewSellerApplications: boolean;
  reviewSellerApplications: boolean;
  viewOperations: boolean;
  viewActivity: boolean;
  manageActivity: boolean;
  viewStaff: boolean;
  manageStaff: boolean;
  manageAgents: boolean;
  viewReleaseControls: boolean;
  manageReleaseControls: boolean;
};

type StaffSession = {
  staff: { display_name: string; job_title?: string; status: string; roles: string[] };
  capabilities: Capabilities;
};

type SellerApplication = {
  id: string;
  seller_type: string;
  display_name: string;
  verification_status: string;
  legal_name: string;
  business_registration_number?: string;
  city: string;
  country_code: string;
  accepted_at: string;
  email?: string;
  phone?: string;
  agent_recommendation?: string;
  agent_summary?: string;
};

type ActivitySettings = {
  collectBuyerActivity: boolean;
  collectSellerActivity: boolean;
  collectStaffActivity: boolean;
  collectAiAgentActivity: boolean;
  collectSecurityActivity: boolean;
  collectTechnicalContext: boolean;
  retentionDays: number;
  updatedAt?: string;
};

type ActivityEvent = {
  id: string;
  actor_type: string;
  actor_client_id?: string;
  category: string;
  event_name: string;
  subject_type?: string;
  subject_id?: string;
  route?: string;
  created_at: string;
};

type ServiceAgent = {
  id: string;
  client_id: string;
  name: string;
  description?: string;
  status: 'active' | 'disabled';
  permissions: string[];
  last_seen_at?: string;
};

type StaffMember = {
  user_id: string;
  display_name: string;
  job_title?: string;
  roles: string[];
  status: 'active' | 'suspended' | 'departed';
  email?: string;
  phone?: string;
  last_sign_in_at?: string;
};

type Operations = {
  sellerVerification: Array<{ status: string; count: number }>;
  payments: Array<{ status: string; count: number; amount_minor: string }>;
  payouts: Array<{ status: string; count: number; amount_minor: string }>;
  activeDeliveryOptions: Array<{ delivery_mode: string; count: number }>;
};

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const agentPermissions = ['catalogue:read', 'seller_applications:read', 'seller_applications:triage'];

async function readError(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error || 'The request could not be completed.';
}

async function apiRequest<T>(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<T>;
}

function friendlyRole(role: string) {
  return role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminWorkspaceClient() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [settings, setSettings] = useState<ActivitySettings | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [agents, setAgents] = useState<ServiceAgent[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const manager = getUserManager();
    if (!manager) {
      setLoading(false);
      return;
    }
    manager.getUser()
      .then((nextUser) => setUser(isCurrentUser(nextUser) ? nextUser : null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user?.access_token) return;
    let active = true;
    setLoading(true);
    apiRequest<StaffSession>('/api/admin/session', user.access_token)
      .then(async (nextSession) => {
        if (!active) return;
        setSession(nextSession);
        const tasks: Promise<void>[] = [];
        if (nextSession.capabilities.viewSellerApplications) {
          tasks.push(apiRequest<{ applications: SellerApplication[] }>('/api/admin/seller-applications', user.access_token).then((payload) => { if (active) setApplications(payload.applications); }));
        }
        if (nextSession.capabilities.viewOperations) {
          tasks.push(apiRequest<Operations>('/api/admin/operations/overview', user.access_token).then((payload) => { if (active) setOperations(payload); }));
        }
        if (nextSession.capabilities.manageActivity) {
          tasks.push(apiRequest<{ settings: ActivitySettings }>('/api/admin/settings/activity-collection', user.access_token).then((payload) => { if (active) setSettings(payload.settings); }));
        }
        if (nextSession.capabilities.viewActivity) {
          tasks.push(apiRequest<{ events: ActivityEvent[] }>('/api/admin/activity?limit=50', user.access_token).then((payload) => { if (active) setEvents(payload.events); }));
        }
        if (nextSession.capabilities.viewStaff) {
          tasks.push(apiRequest<{ staff: StaffMember[] }>('/api/admin/staff', user.access_token).then((payload) => { if (active) setStaffMembers(payload.staff); }));
        }
        if (nextSession.capabilities.manageAgents || nextSession.staff.roles.includes('auditor')) {
          tasks.push(apiRequest<{ agents: ServiceAgent[] }>('/api/admin/agents', user.access_token).then((payload) => { if (active) setAgents(payload.agents); }));
        }
        await Promise.all(tasks);
      })
      .catch((error: Error) => active && setMessage(error.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [user]);

  async function signIn() {
    setMessage('');
    await getUserManager()?.signinRedirect({ state: { returnTo: '/admin' } });
  }

  async function signOut() {
    await getUserManager()?.signoutRedirect();
  }

  async function reviewApplication(sellerId: string, status: 'in_review' | 'rejected') {
    if (!user?.access_token) return;
    const reason = reviewReasons[sellerId]?.trim() || '';
    if (reason.length < 3) {
      setMessage('Add a review reason of at least three characters.');
      return;
    }
    setSaving(`review-${sellerId}`);
    setMessage('');
    try {
      await apiRequest(`/api/admin/seller-applications/${sellerId}/review`, user.access_token, {
        method: 'POST', body: JSON.stringify({ status, reason }),
      });
      setApplications((current) => status === 'rejected' ? current.filter((application) => application.id !== sellerId) : current.map((application) => application.id === sellerId ? { ...application, verification_status: status } : application));
      setMessage('Seller review saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The review could not be saved.');
    } finally {
      setSaving('');
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.access_token || !settings) return;
    setSaving('settings');
    setMessage('');
    try {
      const payload = await apiRequest<{ settings: ActivitySettings }>('/api/admin/settings/activity-collection', user.access_token, {
        method: 'PUT', body: JSON.stringify(settings),
      });
      setSettings(payload.settings);
      setMessage('Activity collection settings saved and audited.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Settings could not be saved.');
    } finally {
      setSaving('');
    }
  }

  async function registerAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.access_token) return;
    const form = new FormData(event.currentTarget);
    const permissions = agentPermissions.filter((permission) => form.get(permission) === 'on');
    setSaving('agent');
    setMessage('');
    try {
      const payload = await apiRequest<{ agent: ServiceAgent }>('/api/admin/agents', user.access_token, {
        method: 'POST',
        body: JSON.stringify({ clientId: form.get('clientId'), name: form.get('name'), description: form.get('description'), permissions }),
      });
      setAgents((current) => [...current, payload.agent].sort((left, right) => left.name.localeCompare(right.name)));
      event.currentTarget.reset();
      setMessage('AI service agent registered. Create its credentials only in the approved identity provider.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The agent could not be registered.');
    } finally {
      setSaving('');
    }
  }

  async function changeAgentStatus(agent: ServiceAgent) {
    if (!user?.access_token) return;
    const status = agent.status === 'active' ? 'disabled' : 'active';
    setSaving(`agent-${agent.id}`);
    try {
      const payload = await apiRequest<{ agent: ServiceAgent }>(`/api/admin/agents/${agent.id}/status`, user.access_token, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, ...payload.agent } : item));
      setMessage(`Agent ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The agent status could not be changed.');
    } finally {
      setSaving('');
    }
  }

  async function changeStaffStatus(staffMember: StaffMember) {
    if (!user?.access_token) return;
    const status = staffMember.status === 'active' ? 'suspended' : 'active';
    setSaving(`staff-${staffMember.user_id}`);
    setMessage('');
    try {
      const payload = await apiRequest<{ staff: StaffMember }>(`/api/admin/staff/${staffMember.user_id}/status`, user.access_token, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      setStaffMembers((current) => current.map((member) => member.user_id === staffMember.user_id ? { ...member, ...payload.staff } : member));
      setMessage(`Staff access ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The staff status could not be changed.');
    } finally {
      setSaving('');
    }
  }

  const configured = isOidcConfigured();

  if (loading && !session) {
    return <main className="admin-gate"><Link className="wordmark" href="/">katondo<span>.</span></Link><p>Opening the staff workspace…</p></main>;
  }

  if (!configured || !user || !session) {
    return (
      <main className="admin-gate">
        <Link className="wordmark" href="/">katondo<span>.</span></Link>
        <section className="admin-login-card">
          <p className="eyebrow">KATONDO OPERATIONS</p>
          <h1>Staff workspace</h1>
          <p>Employees sign in with their approved Katondo work account. Access is based on roles assigned by the identity administrator.</p>
          {configured && !user && <button className="primary-button button-reset" type="button" onClick={signIn}>Sign in with your work account <span>→</span></button>}
          {configured && user && <button className="primary-button button-reset" type="button" onClick={signOut}>Sign out and use a staff account <span>→</span></button>}
          {!configured && <div className="admin-notice">Staff sign-in is not configured for this environment.</div>}
          {message && <div className="admin-notice error">{message}</div>}
          <Link className="text-link" href="/">Return to marketplace</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar"><div><Link className="wordmark" href="/">katondo<span>.</span></Link><span className="admin-badge">Operations</span></div><div className="admin-user"><span>{session.staff.display_name}</span><Link className="text-link" href="/account">Account settings</Link><button className="text-button" type="button" onClick={signOut}>Sign out</button></div></header>
      <section className="admin-heading"><div><p className="eyebrow">STAFF WORKSPACE</p><h1>Welcome back, {session.staff.display_name.split(' ')[0]}.</h1><div className="role-list">{session.staff.roles.map((role) => <span key={role}>{friendlyRole(role)}</span>)}</div></div><p>Your available tools follow the roles assigned to your work account. Every sensitive change is recorded in the audit history.</p></section>
      {message && <div className="admin-flash" role="status">{message}</div>}

      {session.capabilities.viewOperations && operations && <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">MARKETPLACE HEALTH</p><h2>Operations overview</h2></div></div><div className="metric-grid"><article><strong>{operations.sellerVerification.reduce((total, item) => total + Number(item.count), 0)}</strong><span>Seller records</span></article><article><strong>{operations.payments.reduce((total, item) => total + Number(item.count), 0)}</strong><span>Payment records</span></article><article><strong>{operations.payouts.reduce((total, item) => total + Number(item.count), 0)}</strong><span>Payout records</span></article><article><strong>{operations.activeDeliveryOptions.reduce((total, item) => total + Number(item.count), 0)}</strong><span>Delivery options</span></article></div></section>}

      {session.capabilities.viewReleaseControls && <ReleaseControlsPanel token={user.access_token} canManage={session.capabilities.manageReleaseControls} />}

      {session.capabilities.viewSellerApplications && <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">TRUST & SAFETY</p><h2>Seller applications</h2></div><span>{applications.length} awaiting action</span></div><div className="application-table">{applications.map((application) => <article className="review-card" key={application.id}><div className="review-card-head"><div><span>{friendlyRole(application.seller_type)}</span><h3>{application.display_name}</h3><p>{application.legal_name} · {application.city}</p></div><strong>{friendlyRole(application.verification_status)}</strong></div><dl><div><dt>Contact</dt><dd>{application.email || application.phone || 'Verified in identity account'}</dd></div>{application.business_registration_number && <div><dt>Registration</dt><dd>{application.business_registration_number}</dd></div>}<div><dt>Submitted</dt><dd>{new Date(application.accepted_at).toLocaleString('en-ZM')}</dd></div></dl>{application.agent_recommendation && <div className="agent-note"><strong>AI triage: {friendlyRole(application.agent_recommendation)}</strong><p>{application.agent_summary}</p><span>Advisory only — a person must decide.</span></div>}{session.capabilities.reviewSellerApplications && <div className="review-actions"><label>Review reason<textarea value={reviewReasons[application.id] || ''} maxLength={500} onChange={(event) => setReviewReasons((current) => ({ ...current, [application.id]: event.target.value }))} /></label><div><button type="button" disabled={saving === `review-${application.id}`} onClick={() => reviewApplication(application.id, 'in_review')}>Move to review</button><button className="danger-button" type="button" disabled={saving === `review-${application.id}`} onClick={() => reviewApplication(application.id, 'rejected')}>Reject</button></div></div>}</article>)}{applications.length === 0 && <div className="admin-empty">No seller applications are waiting for action.</div>}</div></section>}

      {session.capabilities.viewStaff && <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">ACCESS CONTROL</p><h2>Staff directory</h2></div><span>Roles come from the identity provider</span></div><div className="agent-list">{staffMembers.map((staffMember) => <article key={staffMember.user_id}><div><strong>{staffMember.display_name}</strong><span className={`status-pill ${staffMember.status === 'active' ? 'active' : 'disabled'}`}>{staffMember.status}</span><p>{staffMember.email || staffMember.phone || 'Verified work identity'}</p><small>{staffMember.roles.map(friendlyRole).join(' · ')}{staffMember.last_sign_in_at ? ` · Last sign-in ${new Date(staffMember.last_sign_in_at).toLocaleString('en-ZM')}` : ''}</small></div>{session.capabilities.manageStaff && staffMember.status !== 'departed' && <button type="button" disabled={saving === `staff-${staffMember.user_id}`} onClick={() => changeStaffStatus(staffMember)}>{staffMember.status === 'active' ? 'Suspend' : 'Reactivate'}</button>}</article>)}{staffMembers.length === 0 && <div className="admin-empty">Staff members appear after their first successful staff sign-in.</div>}</div></section>}

      {session.capabilities.manageActivity && settings && <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">DATA GOVERNANCE</p><h2>Activity collection</h2></div><span>Top administrator only</span></div><p className="section-copy">Each category is optional and starts disabled. Katondo never records passwords, access tokens, payment credentials, identity documents, private message contents, or form-field contents in this ledger.</p><form className="settings-form" onSubmit={saveSettings}>{([
        ['collectBuyerActivity', 'Buyer activity', 'Approved account events such as catalogue views, searches, and checkout starts.'],
        ['collectSellerActivity', 'Seller activity', 'Seller application, dashboard, and listing workflow events.'],
        ['collectStaffActivity', 'Staff activity', 'Workspace access, reviews, and operational actions.'],
        ['collectAiAgentActivity', 'AI agent activity', 'Machine access and human-review recommendations.'],
        ['collectSecurityActivity', 'Security activity', 'Authentication failures and security events.'],
        ['collectTechnicalContext', 'Technical context', 'Hashed IP address and shortened user-agent string. Requires a protected hashing secret.'],
      ] as const).map(([field, title, description]) => <label className="setting-row" key={field}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={settings[field]} onChange={(event) => setSettings((current) => current ? { ...current, [field]: event.target.checked } : current)} /></label>)}<label className="retention-field">Retention period<input type="number" min={1} max={365} value={settings.retentionDays} onChange={(event) => setSettings((current) => current ? { ...current, retentionDays: Number(event.target.value) } : current)} /><span>days</span></label><button className="primary-button button-reset" type="submit" disabled={saving === 'settings'}>{saving === 'settings' ? 'Saving…' : 'Save collection settings'}</button></form></section>}

      {(session.capabilities.manageAgents || session.staff.roles.includes('auditor')) && <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">AUTOMATION</p><h2>AI service agents</h2></div><span>Human decisions stay required</span></div><p className="section-copy">Agents use identity-provider machine credentials, receive only registered permissions, and cannot approve or reject sellers. Katondo stores their recommendations for staff review.</p>{session.capabilities.manageAgents && <form className="agent-form" onSubmit={registerAgent}><label>Agent name<input name="name" required minLength={2} maxLength={120} /></label><label>Identity provider client ID<input name="clientId" required minLength={3} maxLength={200} /></label><label className="wide-field">Purpose and owner<textarea name="description" maxLength={500} /></label><fieldset className="wide-field"><legend>Permissions</legend>{agentPermissions.map((permission) => <label className="check-row" key={permission}><input type="checkbox" name={permission} /><span>{permission}</span></label>)}</fieldset><button className="primary-button button-reset" type="submit" disabled={saving === 'agent'}>Register agent</button></form>}<div className="agent-list">{agents.map((agent) => <article key={agent.id}><div><strong>{agent.name}</strong><span className={`status-pill ${agent.status}`}>{agent.status}</span><p>{agent.description || agent.client_id}</p><small>{agent.permissions.join(' · ')}</small></div>{session.capabilities.manageAgents && <button type="button" disabled={saving === `agent-${agent.id}`} onClick={() => changeAgentStatus(agent)}>{agent.status === 'active' ? 'Disable' : 'Enable'}</button>}</article>)}{agents.length === 0 && <div className="admin-empty">No AI service agents are registered.</div>}</div></section>}

      {session.capabilities.viewActivity && <section className="admin-section"><div className="admin-section-title"><div><p className="eyebrow">ACCOUNTABILITY</p><h2>Recent activity</h2></div><span>Latest 50 events</span></div><div className="event-table">{events.map((event) => <article key={event.id}><time>{new Date(event.created_at).toLocaleString('en-ZM')}</time><strong>{event.event_name}</strong><span>{friendlyRole(event.actor_type)} · {event.category}</span><small>{event.route || event.subject_type || 'Recorded event'}</small></article>)}{events.length === 0 && <div className="admin-empty">No activity events have been collected.</div>}</div></section>}

      <footer><Link className="wordmark" href="/">katondo<span>.</span></Link><p>Staff access is role based and audited.</p><span>Multi-market operations</span></footer>
    </main>
  );
}
