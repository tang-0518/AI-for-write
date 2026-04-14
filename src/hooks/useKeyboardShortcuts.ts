// =============================================================
// hooks/useKeyboardShortcuts.ts — 全局键盘快捷键
// 用 ref 存储最新回调，避免每次回调变化都重新注册监听器
// =============================================================

import { useEffect, useRef } from 'react';

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

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions) {
  const ref = useRef(opts);
  ref.current = opts; // 每次 render 同步最新，不触发 effect 重跑

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const { onFind, onReplace, onCrossSearch, onFontIncrease, onFontDecrease, onHelp, onEscape, onSave } = ref.current;

      // ESC：关闭当前打开的面板（不需要 Ctrl）
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      // ? 键（不需要 Ctrl）触发帮助
      if (!ctrl && e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onHelp?.();
        return;
      }

      if (!ctrl) return;

      if (e.key === 'f' && !e.shiftKey) { e.preventDefault(); onFind(); }
      if (e.key === 'h' && !e.shiftKey) { e.preventDefault(); onReplace(); }
      if ((e.key === 'F' || e.key === 'f') && e.shiftKey) { e.preventDefault(); onCrossSearch(); }
      if (e.key === '=' || e.key === '+') { e.preventDefault(); onFontIncrease(); }
      if (e.key === '-') { e.preventDefault(); onFontDecrease(); }
      if (e.key === 's' && !e.shiftKey) { e.preventDefault(); onSave?.(); }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // 空依赖：监听器只注册一次，通过 ref 访问最新回调
}
