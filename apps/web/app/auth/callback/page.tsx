'use client';

import Link from 'next/link';
import BrandMark from '../../../components/BrandMark';
import ThemeToggle from '../../../components/ThemeToggle';
import { useEffect, useState } from 'react';
import { getUserManager, safeReturnPath } from '../../../lib/oidc';

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
        window.location.replace(safeReturnPath(requestedPath));
      })
      .catch(() => {
        // The provider reports cancellations and failures in the address, e.g. ?error=access_denied.
        const params = new URLSearchParams(window.location.search);
        const providerError = params.get('error');
        setError(providerError === 'access_denied'
          ? 'Sign-in was cancelled. You can try again whenever you’re ready.'
          : 'We could not complete sign-in. Please return and try again.');
      });
  }, []);

  return (
    <main className="auth-callback">
      <Link className="wordmark" href="/"><BrandMark />katondo</Link><ThemeToggle />
      <div className="callback-card" role="status">

        <h1>{error ? 'Sign-in needs attention' : 'Completing sign-in'}</h1>
        <p>{error || 'Please wait while we securely return you to Katondo.'}</p>
        {error && <Link className="primary-button" href="/">Return to Katondo</Link>}
      </div>
    </main>
  );
}
