// =============================================================
// components/CommandBar.tsx — 每次操作的临时指令输入栏
// =============================================================

import { useState, useRef, useEffect } from 'react';
import type { PolishMode } from '../types';
import { POLISH_MODE_CONFIGS } from '../types';

interface CommandBarProps {
  disabled: boolean;
  isStreaming: boolean;
  isPolishing: boolean;
  isGeneratingVersions?: boolean;
  onContinue: (prompt: string) => void;
  onPolish: (prompt: string, mode: PolishMode) => void;
  onMultiVersion?: (prompt: string) => void;
}

export function CommandBar({ disabled, isStreaming, isPolishing, isGeneratingVersions, onContinue, onPolish, onMultiVersion }: CommandBarProps) {
  const [prompt, setPrompt] = useState('');
  const [polishMode, setPolishMode] = useState<PolishMode>('standard');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 自动撑高
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }, [prompt]);

  // 点击外部关闭模式菜单
  useEffect(() => {
    if (!showModeMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowModeMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModeMenu]);

  const triggerContinue = () => {
    if (disabled) return;
    onContinue(prompt.trim());
    setPrompt('');
  };

  const triggerPolish = () => {
    if (disabled) return;
    onPolish(prompt.trim(), polishMode);
    setPrompt('');
    setShowModeMenu(false);
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

  const currentModeConfig = POLISH_MODE_CONFIGS[polishMode];

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
        {/* 续写 + 多版本合并为分裂按钮 */}
        <div className="polish-btn-group">
          <button
            className="btn btn-primary command-btn polish-main-btn"
            onClick={triggerContinue}
            disabled={disabled}
            title="Ctrl+Enter"
          >
            {isStreaming ? <><span className="btn-spinner" />续写中…</> : <>✨ 续写</>}
          </button>
          {onMultiVersion && (
            <button
              className="btn btn-primary polish-mode-toggle"
              onClick={triggerMultiVersion}
              disabled={disabled || isGeneratingVersions}
              title="生成 3 个版本供选择"
              style={{ fontSize: 11 }}
            >
              {isGeneratingVersions ? <span className="btn-spinner" /> : '🎲'}
            </button>
          )}
        </div>

        {/* 润色按钮 + 模式选择器 */}
        <div className="polish-btn-group" ref={menuRef}>
          <button
            className="btn btn-secondary command-btn polish-main-btn"
            onClick={triggerPolish}
            disabled={disabled}
            title={`Ctrl+Shift+Enter — 当前模式：${currentModeConfig.label}`}
          >
            {isPolishing ? <><span className="btn-spinner btn-spinner-gold" />{currentModeConfig.label}中…</> : <>{currentModeConfig.emoji} {currentModeConfig.label}</>}
          </button>
          <button
            className="btn btn-secondary polish-mode-toggle"
            onClick={() => setShowModeMenu(v => !v)}
            disabled={disabled}
            title="切换润色模式"
          >
            ▾
          </button>
          {showModeMenu && (
            <div className="polish-mode-menu">
              {(Object.entries(POLISH_MODE_CONFIGS) as [PolishMode, typeof POLISH_MODE_CONFIGS[PolishMode]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  className={`polish-mode-item ${polishMode === key ? 'active' : ''}`}
                  onClick={() => { setPolishMode(key); setShowModeMenu(false); }}
                >
                  <span className="polish-mode-emoji">{cfg.emoji}</span>
                  <span className="polish-mode-label">{cfg.label}</span>
                  <span className="polish-mode-desc">{cfg.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
