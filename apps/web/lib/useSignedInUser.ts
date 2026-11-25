'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from 'oidc-client-ts';
import { apiUrl } from './catalogue';
import { getUserManager, isCurrentUser } from './oidc';

/** The signed-in user (or null), whether the check has finished, and a fetch helper that adds their token. */
export function useSignedInUser() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const manager = getUserManager();
    if (!manager) { setChecked(true); return; }
    manager.getUser().then((current) => setUser(isCurrentUser(current) ? current : null)).catch(() => setUser(null)).finally(() => setChecked(true));
  }, []);

  const api = useCallback(async <T,>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        ...(user?.access_token ? { Authorization: `Bearer ${user.access_token}` } : {}),
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok) throw Object.assign(new Error(payload?.error || 'Something went wrong. Try again.'), { status: response.status, payload });
    return payload as T;
  }, [user]);

  const signIn = useCallback((returnTo: string) => getUserManager()?.signinRedirect({ state: { returnTo } }), []);

  return { user, checked, api, signIn, signInAvailable: Boolean(getUserManager()) };
}
