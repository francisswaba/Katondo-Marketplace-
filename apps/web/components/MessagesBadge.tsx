'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/catalogue';
import { getUserManager, isCurrentUser } from '../lib/oidc';

/** Unread message count next to the header's Messages link. Hidden when signed out or at zero. */
export default function MessagesBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    async function check() {
      const user = await getUserManager()?.getUser().catch(() => null);
      if (!user || !isCurrentUser(user)) return;
      const response = await fetch(`${apiUrl}/api/messages/unread`, { headers: { Authorization: `Bearer ${user.access_token}` } }).catch(() => null);
      if (!response?.ok || !active) return;
      const payload = await response.json() as { unread: number };
      setUnread(payload.unread);
    }
    void check();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 60_000);
    const onRead = () => { void check(); };
    window.addEventListener('katondo-messages-read', onRead);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('katondo-messages-read', onRead); };
  }, []);

  if (!unread) return null;
  return <span className="unread-badge" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>;
}
