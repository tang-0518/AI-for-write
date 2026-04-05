// =============================================================
// components/CommandBar.tsx — 每次操作的临时指令输入栏
// =============================================================

import { useState, useRef, useEffect } from 'react';

interface CommandBarProps {
  disabled: boolean;
  isStreaming: boolean;
  isPolishing: boolean;
  isGeneratingVersions?: boolean;
  onContinue: (prompt: string) => void;
  onPolish: (prompt: string) => void;
  onMultiVersion?: (prompt: string) => void;
}

export function CommandBar({ disabled, isStreaming, isPolishing, isGeneratingVersions, onContinue, onPolish, onMultiVersion }: CommandBarProps) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动撑高
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }, [prompt]);

  const triggerContinue = () => {
    if (disabled) return;
    onContinue(prompt.trim());
    setPrompt('');
  };

  const triggerPolish = () => {
    if (disabled) return;
    onPolish(prompt.trim());
    setPrompt('');
  };

  const triggerMultiVersion = () => {
    if (disabled || !onMultiVersion) return;
    onMultiVersion(prompt.trim());
    setPrompt('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      triggerContinue();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      triggerPolish();
    }
  };

  return (
    <div className="command-bar">
      <textarea
        ref={textareaRef}
        className="command-input"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入本次指令，然后点击操作…（可留空）"
        rows={1}
        disabled={disabled}
        spellCheck={false}
      />
      <div className="command-actions">
        <button
          className="btn btn-primary command-btn"
          onClick={triggerContinue}
          disabled={disabled}
          title="Ctrl+Enter"
        >
          {isStreaming ? <><span className="btn-spinner" />续写中…</> : <>✨ 续写</>}
        </button>
        <button
          className="btn btn-secondary command-btn"
          onClick={triggerPolish}
          disabled={disabled}
          title="Ctrl+Shift+Enter"
        >
          {isPolishing ? <><span className="btn-spinner btn-spinner-gold" />润色中…</> : <>💎 润色</>}
        </button>
        {onMultiVersion && (
          <button
            className="btn btn-ghost command-btn"
            onClick={triggerMultiVersion}
            disabled={disabled}
            title="生成 3 个版本供选择"
          >
            {isGeneratingVersions ? <><span className="btn-spinner" />生成中…</> : <>🎲 多版本</>}
          </button>
        )}
      </div>
    </div>
  );
}
