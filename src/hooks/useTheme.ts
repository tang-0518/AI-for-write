// =============================================================
// hooks/useTheme.ts — 主题管理 Hook
// =============================================================

import { useEffect, useCallback } from 'react';
import { useStorage } from './useStorage';

export interface Theme {
  id: string;
  label: string;
}

export const THEMES: Theme[] = [
  { id: 'default',       label: '墨夜（默认）' },
  { id: 'morning-mist',  label: '晨雾' },
  { id: 'forest',        label: '竹林' },
  { id: 'ocean',         label: '深海' },
];

export function useTheme() {
  const [theme, setThemeState] = useStorage<string>('novel-theme', 'default');

  const setTheme = useCallback((id: string) => {
    setThemeState(id);
    document.documentElement.setAttribute('data-theme', id);
  }, [setThemeState]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme ?? 'default');
  }, [theme]);

  return { theme: theme ?? 'default', setTheme, THEMES };
}
