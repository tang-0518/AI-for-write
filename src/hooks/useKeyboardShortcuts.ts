// =============================================================
// hooks/useKeyboardShortcuts.ts - 全局键盘快捷键
// =============================================================

import { useEffect, useEffectEvent } from 'react';

interface UseKeyboardShortcutsOptions {
  onFind: () => void;
  onReplace: () => void;
  onCrossSearch: () => void;
  onFontIncrease: () => void;
  onFontDecrease: () => void;
  onHelp?: () => void;
  onEscape?: () => void;
  onSave?: () => void;
}

type ShortcutScope = 'global' | 'writing-input' | 'other-input';

function getShortcutScope(target: EventTarget | null): ShortcutScope {
  if (!(target instanceof HTMLElement)) return 'global';

  if (target.closest('.editor-textarea, .command-input, .instruction-input')) {
    return 'writing-input';
  }

  if (target.isContentEditable) return 'other-input';

  return target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]')
    ? 'other-input'
    : 'global';
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions) {
  const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented) return;

    const ctrl = event.ctrlKey || event.metaKey;
    const shortcutScope = getShortcutScope(event.target);
    const inProtectedInput = shortcutScope === 'other-input';
    const {
      onFind,
      onReplace,
      onCrossSearch,
      onFontIncrease,
      onFontDecrease,
      onHelp,
      onEscape,
      onSave,
    } = opts;

    if (event.key === 'Escape') {
      if (inProtectedInput) return;
      onEscape?.();
      return;
    }

    if (!ctrl && event.key === '?' && shortcutScope === 'global') {
      event.preventDefault();
      onHelp?.();
      return;
    }

    if (!ctrl || inProtectedInput) return;

    if (event.key === 'f' && !event.shiftKey) { event.preventDefault(); onFind(); }
    if (event.key === 'h' && !event.shiftKey) { event.preventDefault(); onReplace(); }
    if ((event.key === 'F' || event.key === 'f') && event.shiftKey) { event.preventDefault(); onCrossSearch(); }
    if (event.key === '=' || event.key === '+') { event.preventDefault(); onFontIncrease(); }
    if (event.key === '-') { event.preventDefault(); onFontDecrease(); }
    if (event.key === 's' && !event.shiftKey) { event.preventDefault(); onSave?.(); }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => handleKeydown(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
