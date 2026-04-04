// =============================================================
// components/Editor.tsx — 核心编辑器（Ghost 文字 + 审核层）
// =============================================================

import { useEffect, useRef } from 'react';
import type { AiInsertRange } from '../hooks/useEditor';

interface PendingPolish {
  text: string;
  selStart: number;
  selEnd: number;
}

interface EditorProps {
  content: string;
  isStreaming: boolean;
  isPolishing: boolean;
  aiInsertRange: AiInsertRange | null;
  pendingContinuation: string;
  hasPendingContinuation: boolean;
  pendingPolish: PendingPolish | null;
  focusRange?: { start: number; end: number } | null;
  onChange: (value: string) => void;
  onContinue: () => void;
  onAcceptContinuation: () => void;
  onRejectContinuation: () => void;
  onAcceptPolish: () => void;
  onRejectPolish: () => void;
  onSelectionChange: (range: { start: number; end: number } | null) => void;
}

export function Editor({
  content,
  isStreaming,
  isPolishing,
  aiInsertRange,
  pendingContinuation,
  hasPendingContinuation,
  pendingPolish,
  focusRange,
  onChange,
  onContinue,
  onAcceptContinuation,
  onRejectContinuation,
  onAcceptPolish,
  onRejectPolish,
  onSelectionChange,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ghostOverlayRef = useRef<HTMLDivElement>(null);
  const isProcessing = isStreaming || isPolishing;
  const hasPending = hasPendingContinuation || pendingPolish !== null;

  // 流式输出时自动滚到底（textarea + ghost overlay 同步）
  useEffect(() => {
    const el = textareaRef.current;
    const overlay = ghostOverlayRef.current;
    if (el && isStreaming) {
      el.scrollTop = el.scrollHeight;
      if (overlay) overlay.scrollTop = overlay.scrollHeight;
    }
  }, [pendingContinuation, isStreaming]);

  // textarea 滚动时同步 ghost overlay
  useEffect(() => {
    const el = textareaRef.current;
    const overlay = ghostOverlayRef.current;
    if (!el || !overlay) return;
    const sync = () => { overlay.scrollTop = el.scrollTop; };
    el.addEventListener('scroll', sync);
    return () => el.removeEventListener('scroll', sync);
  }, []);

  // 查找替换：当 focusRange 变化时，定位光标并滚动到匹配处
  useEffect(() => {
    if (!focusRange) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(focusRange.start, focusRange.end);
    // 计算匹配行并滚动到可见区域
    const lineHeight = parseInt(getComputedStyle(el).lineHeight || '24', 10);
    const textBefore = el.value.slice(0, focusRange.start);
    const linesBefore = textBefore.split('\n').length - 1;
    const approxScrollTop = linesBefore * lineHeight - el.clientHeight / 2;
    el.scrollTop = Math.max(0, approxScrollTop);
  }, [focusRange]);

  // 全局键盘：Tab=接受，Esc=拒绝（仅在有待审核内容时生效）
  useEffect(() => {
    if (!hasPendingContinuation && pendingPolish === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (hasPendingContinuation) onAcceptContinuation();
        else if (pendingPolish !== null) onAcceptPolish();
      } else if (e.key === 'Escape') {
        if (hasPendingContinuation) onRejectContinuation();
        else if (pendingPolish !== null) onRejectPolish();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasPendingContinuation, pendingPolish, onAcceptContinuation, onRejectContinuation, onAcceptPolish, onRejectPolish]);

  // 追踪选区，通知 useEditor
  const handleSelectionChange = () => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    onSelectionChange(s !== e ? { start: s, end: e } : null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!isProcessing && !hasPending) onContinue();
    }
  };

  // AI 新内容接受后高亮覆盖层
  const renderHighlight = () => {
    if (!aiInsertRange) return null;
    const before = content.slice(0, aiInsertRange.start);
    const highlighted = content.slice(aiInsertRange.start, aiInsertRange.start + aiInsertRange.length);
    return (
      <div className="ai-highlight-overlay" aria-hidden>
        <span className="ai-highlight-before">{before}</span>
        <span className="ai-highlight-mark ai-highlight-visible">
          {highlighted}
        </span>
      </div>
    );
  };

  // Ghost 文字覆盖层（流式 + 待审核）
  const renderGhostOverlay = () => {
    if (!pendingContinuation) return null;
    return (
      <div className="ai-ghost-overlay" aria-hidden ref={ghostOverlayRef}>
        <span className="ghost-original">{content}</span>
        <span className="ghost-text">{pendingContinuation}</span>
      </div>
    );
  };

  // 续写审核栏
  const renderContinuationAuditBar = () => {
    if (!hasPendingContinuation) return null;
    return (
      <div className="audit-bar">
        <span className="audit-label">✨ AI 续写预览</span>
        <div className="audit-actions">
          <button className="audit-btn audit-accept" onClick={onAcceptContinuation}>
            ✅ 接受 <kbd>Tab</kbd>
          </button>
          <button className="audit-btn audit-reject" onClick={onRejectContinuation}>
            ✕ 拒绝 <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    );
  };

  // 润色审核面板
  const renderPolishPanel = () => {
    if (pendingPolish === null) return null;
    const { text, selStart, selEnd } = pendingPolish;
    const isPartial = selStart !== 0 || selEnd !== content.length;
    const originalText = content.slice(selStart, selEnd);
    const originalCount = originalText.replace(/\s/g, '').length;
    const polishedCount = text.replace(/\s/g, '').length;
    const delta = polishedCount - originalCount;
    return (
      <div className="polish-panel">
        <div className="polish-panel-header">
          <span className="audit-label">
            💎 {isPartial ? `润色选中内容` : '润色全文'}
            <span className="polish-delta">
              {originalCount} 字 → {polishedCount} 字
              {delta !== 0 && (
                <span className={delta > 0 ? 'delta-plus' : 'delta-minus'}>
                  {delta > 0 ? ` +${delta}` : ` ${delta}`}
                </span>
              )}
            </span>
          </span>
          <div className="audit-actions">
            <button className="audit-btn audit-accept" onClick={onAcceptPolish}>
              ✅ 接受 <kbd>Tab</kbd>
            </button>
            <button className="audit-btn audit-reject" onClick={onRejectPolish}>
              ✕ 拒绝 <kbd>Esc</kbd>
            </button>
          </div>
        </div>
        <div className="polish-panel-body">
          <div className="polish-col">
            <div className="polish-col-label">原文</div>
            <div className="polish-panel-content polish-original">{originalText}</div>
          </div>
          <div className="polish-divider" />
          <div className="polish-col">
            <div className="polish-col-label">润色后</div>
            <div className="polish-panel-content">{text}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="editor-wrapper">
      {/* 处理中遮罩 */}
      {isProcessing && <div className="editor-overlay" />}

      {/* AI 接受后高亮 */}
      {renderHighlight()}

      {/* Ghost 文字（流式 + 待审核） */}
      {renderGhostOverlay()}

      <textarea
        ref={textareaRef}
        className={`editor-textarea ${isStreaming ? 'streaming' : ''}`}
        value={content}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={handleSelectionChange}
        onMouseUp={handleSelectionChange}
        placeholder={
          '在这里开始你的故事...\n\n💡 小提示：\n• 输入50字以上内容后，点击「AI续写」或按 Ctrl+Enter\n• 已有内容可点击「AI润色」进行优化\n• 内容自动保存到本地，刷新不丢失'
        }
        disabled={isProcessing || hasPending}
        spellCheck={false}
      />

      {isStreaming && (
        <div className="typing-cursor-container">
          <span className="typing-cursor" />
        </div>
      )}

      {/* 续写审核栏 */}
      {renderContinuationAuditBar()}

      {/* 润色审核面板 */}
      {renderPolishPanel()}
    </div>
  );
}
