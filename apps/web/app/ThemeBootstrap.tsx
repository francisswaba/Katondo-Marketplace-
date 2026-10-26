'use client';

import { useEffect } from 'react';

export default function ThemeBootstrap() {
  useEffect(() => {
    const theme = window.localStorage.getItem('katondo-theme');
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      document.documentElement.dataset.theme = theme;
    }
  }, []);
  return null;
}
