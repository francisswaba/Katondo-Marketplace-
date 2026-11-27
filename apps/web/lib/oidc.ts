'use client';

import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

let userManager: UserManager | null = null;

/**
 * Sign-in is offered only when the provider is configured AND switched on. The provider's
 * details can be set ahead of approval; NEXT_PUBLIC_AUTH_ENABLED stays false until then.
 */
export function isOidcConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
      && process.env.NEXT_PUBLIC_AUTH_AUTHORITY
      && process.env.NEXT_PUBLIC_AUTH_CLIENT_ID,
  );
}

/** Which sign-in provider is in use; changes wording such as where to reset a password. */
export const authProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'entra' ? 'entra' : 'generic';

/** Only same-site paths are allowed as a place to return to after sign-in. */
export function safeReturnPath(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

export function getUserManager() {
  if (typeof window === 'undefined' || !isOidcConfigured()) {
    return null;
  }

  userManager ??= new UserManager({
    authority: process.env.NEXT_PUBLIC_AUTH_AUTHORITY!,
    client_id: process.env.NEXT_PUBLIC_AUTH_CLIENT_ID!,
    redirect_uri: process.env.NEXT_PUBLIC_AUTH_REDIRECT_URI || `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: process.env.NEXT_PUBLIC_AUTH_POST_LOGOUT_REDIRECT_URI || `${window.location.origin}/sell`,
    response_type: 'code',
    scope: process.env.NEXT_PUBLIC_AUTH_SCOPE || 'openid profile email phone',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
    monitorSession: false,
  });

  return userManager;
}

export function isCurrentUser(user: User | null) {
  return Boolean(user && !user.expired && user.access_token);
}
