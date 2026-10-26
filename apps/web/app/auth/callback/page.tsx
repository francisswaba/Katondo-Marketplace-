'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getUserManager } from '../../../lib/oidc';

export default function AuthCallbackPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    const manager = getUserManager();
    if (!manager) {
      setError('Sign-in is not configured for this environment.');
      return;
    }

    manager.signinRedirectCallback()
      .then((user) => {
        const requestedPath = user.state && typeof user.state === 'object' && 'returnTo' in user.state
          ? (user.state as { returnTo?: unknown }).returnTo
          : null;
        const returnTo = requestedPath === '/admin' || requestedPath === '/sell' || requestedPath === '/account' ? requestedPath : '/';
        window.location.replace(returnTo);
      })
      .catch(() => setError('We could not complete sign-in. Please return and try again.'));
  }, []);

  return (
    <main className="auth-callback">
      <Link className="wordmark" href="/">katondo<span>.</span></Link>
      <div className="callback-card" role="status">
        <span className="callback-mark">✳</span>
        <h1>{error ? 'Sign-in needs attention' : 'Completing sign-in'}</h1>
        <p>{error || 'Please wait while we securely return you to Katondo.'}</p>
        {error && <Link className="primary-button" href="/">Return to Katondo</Link>}
      </div>
    </main>
  );
}
