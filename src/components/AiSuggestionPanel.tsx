// =============================================================
// components/AiSuggestionPanel.tsx — AI 建议右侧面板
// =============================================================

interface AiSuggestionPanelProps {
  content: string;
  isStreaming: boolean;
  isPolishing: boolean;
  pendingContinuation: string;
  hasPendingContinuation: boolean;
  isTruncated?: boolean;
  pendingPolish: { text: string; selStart: number; selEnd: number } | null;
  onAcceptContinuation: () => void;
  onRejectContinuation: () => void;
  onResumeWriting?: () => void;
  onAcceptPolish: () => void;
  onRejectPolish: () => void;
}

export function AiSuggestionPanel({
  content,
  isStreaming,
  isPolishing,
  pendingContinuation,
  hasPendingContinuation,
  isTruncated,
  pendingPolish,
  onAcceptContinuation,
  onRejectContinuation,
  onResumeWriting,
  onAcceptPolish,
  onRejectPolish,
}: AiSuggestionPanelProps) {
  // 续写字数差
  const contDelta = pendingContinuation.replace(/\s/g, '').length;
  // 润色前后字数差
  const origSelected = pendingPolish
    ? content.slice(pendingPolish.selStart, pendingPolish.selEnd).replace(/\s/g, '').length
    : 0;
  const polishDelta = pendingPolish
    ? pendingPolish.text.replace(/\s/g, '').length - origSelected
    : 0;

  return (
    <div className="ai-suggestion-panel">
      {/* ── 续写面板 ── */}
      {(isStreaming || hasPendingContinuation) && (
        <>
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-panel-icon">✨</span>
              AI 续写
              {contDelta > 0 && (
                <span className="ai-panel-count delta-plus">+{contDelta}</span>
              )}
            </div>
            {hasPendingContinuation && (
              <div className="ai-panel-actions">
                <button className="ai-accept-btn" onClick={onAcceptContinuation} title="接受 (Tab)">
                  ✓ 接受 <kbd>Tab</kbd>
                </button>
                {isTruncated && onResumeWriting && (
                  <button className="ai-resume-btn" onClick={onResumeWriting} title="内容被截断，继续生成">
                    ↓ 接着写
                  </button>
                )}
                <button className="ai-reject-btn" onClick={onRejectContinuation} title="丢弃 (Esc)">
                  ✗ <kbd>Esc</kbd>
                </button>
              </div>
            )}
          </div>
          <div className="ai-panel-body">
            {isStreaming && !pendingContinuation && (
              <div className="ai-loading-dots">
                <span /><span /><span />
              </div>
            )}
            <div className="ai-continuation-content">
              <pre className="ai-continuation-text">
                {pendingContinuation}
                {isStreaming && <span className="ai-stream-cursor" />}
              </pre>
              {isTruncated && !isStreaming && (
                <div className="ai-truncated-hint">
                  ⚠️ 内容达到长度上限，点击「接着写」继续生成
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── 润色面板 ── */}
      {(isPolishing || pendingPolish !== null) && (
        <>
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-panel-icon">💎</span>
              AI 润色
              {pendingPolish !== null && polishDelta !== 0 && (
                <span className={`ai-panel-count ${polishDelta > 0 ? 'delta-plus' : 'delta-minus'}`}>
                  {polishDelta > 0 ? '+' : ''}{polishDelta}
                </span>
              )}
            </div>
            {pendingPolish !== null && (
              <div className="ai-panel-actions">
                <button className="ai-accept-btn" onClick={onAcceptPolish} title="接受 (Tab)">
                  ✓ 接受 <kbd>Tab</kbd>
                </button>
                <button className="ai-reject-btn" onClick={onRejectPolish} title="丢弃 (Esc)">
                  ✗ <kbd>Esc</kbd>
                </button>
              </div>
            )}
          </div>
          <div className="ai-panel-body">
            {isPolishing && pendingPolish === null && (
              <div className="ai-loading-dots">
                <span /><span /><span />
              </div>
            )}
            {pendingPolish !== null && (
              <div className="ai-polish-compare">
                <div className="ai-polish-col">
                  <div className="ai-polish-col-label">原文</div>
                  <div className="ai-polish-col-body original-text">
                    {content.slice(pendingPolish.selStart, pendingPolish.selEnd)}
                  </div>
                </div>
                <div className="ai-polish-divider" />
                <div className="ai-polish-col">
                  <div className="ai-polish-col-label">润色后</div>
                  <div className="ai-polish-col-body">{pendingPolish.text}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

    </div>
  );
}
