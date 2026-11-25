'use client';

import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';

/** The theme the page is showing right now, resolving "use device setting" to light or dark. */
function currentMode(): Mode {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem('katondo-theme', theme);
  } catch {
    // Storage can be blocked (private browsing); the switch still works for this visit.
  }
  window.dispatchEvent(new Event('katondo-theme'));
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const sync = () => setMode(currentMode());
    sync();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    window.addEventListener('katondo-theme', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('katondo-theme', sync);
    };
  }, []);

  const next: Mode = mode === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        {mode === 'dark'
          ? <><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
          : <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />}
      </svg>
    </button>
  );
}
