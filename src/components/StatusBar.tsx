// =============================================================
// components/StatusBar.tsx — 状态栏（含已保存提示 + 字数目标进度条）
// =============================================================

import { useEffect, useState } from 'react';

interface StatusBarProps {
  content: string;
  isStreaming: boolean;
  isPolishing: boolean;
  error: string | null;
  savedAt: number | null;
  wordGoal?: number;
  compactionCount?: number;
  compactDisabled?: boolean;
}

export function StatusBar({ content, isStreaming, isPolishing, error, savedAt, wordGoal = 0, compactionCount = 0, compactDisabled = false }: StatusBarProps) {
  const charCount = content.length;
  const chineseCount = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const paragraphCount = content ? content.split(/\n+/).filter(p => p.trim().length > 0).length : 0;
  // 预计阅读时间：每分钟约 300 汉字
  const readMinutes = chineseCount > 0 ? Math.max(1, Math.round(chineseCount / 300)) : 0;

  const goalActive = wordGoal > 0;
  const goalPct = goalActive ? Math.min(100, Math.round((chineseCount / wordGoal) * 100)) : 0;
  const goalDone = goalActive && chineseCount >= wordGoal;

  // "已保存"提示：savedAt 后 2 秒内可见
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    const showTimer = setTimeout(() => setShowSaved(true), 0);
    const hideTimer = setTimeout(() => setShowSaved(false), 2000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [savedAt]);

  // 错误消息自动消失（4 秒）
  const [visibleError, setVisibleError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) {
      const clearTimer = setTimeout(() => setVisibleError(null), 0);
      return () => clearTimeout(clearTimer);
    }
    const showTimer = setTimeout(() => setVisibleError(error), 0);
    const hideTimer = setTimeout(() => setVisibleError(null), 4000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [error]);

  const getStatusText = () => {
    if (visibleError) return null;
    if (isStreaming) return '✨ AI 正在续写…';
    if (isPolishing) return '💎 AI 正在润色…';
    if (charCount === 0) return '开始写作吧！';
    return null;
  };

  const statusText = getStatusText();

  return (
    <footer className="status-bar">
      {/* 字数目标进度条（横贯整个状态栏顶部） */}
      {goalActive && (
        <div className="word-goal-track" title={`写作进度：${chineseCount.toLocaleString()} / ${wordGoal.toLocaleString()} 字`}>
          <div
            className={`word-goal-fill ${goalDone ? 'word-goal-done' : ''}`}
            style={{ width: `${goalPct}%` }}
          />
        </div>
      )}

      {/* 左侧：统计 */}
      <div className="status-stats">
        <span className="stat-item">
          <span className="stat-value">{chineseCount.toLocaleString()}</span>
          <span className="stat-label">汉字</span>
        </span>
        {goalActive && (
          <>
            <span className="stat-divider">/</span>
            <span className="stat-item">
              <span className={`stat-value ${goalDone ? 'goal-reached' : 'stat-goal'}`}>
                {wordGoal.toLocaleString()}
              </span>
              <span className="stat-label">{goalDone ? '✓ 目标达成' : `目标 ${goalPct}%`}</span>
            </span>
          </>
        )}
        <span className="stat-divider">·</span>
        <span className="stat-item">
          <span className="stat-value">{paragraphCount}</span>
          <span className="stat-label">段落</span>
        </span>
        {readMinutes > 0 && (
          <>
            <span className="stat-divider">·</span>
            <span className="stat-item">
              <span className="stat-value">~{readMinutes}</span>
              <span className="stat-label">分钟阅读</span>
            </span>
          </>
        )}
      </div>

      {/* 中间：错误 / 状态 */}
      <div className="status-center">
        {visibleError ? (
          <span className="status-error">⚠️ {visibleError}</span>
        ) : statusText ? (
          <span className={`status-text ${isStreaming || isPolishing ? 'status-active' : ''}`}>
            {statusText}
          </span>
        ) : null}
      </div>

      {/* 右侧：压缩指示 + 已保存 + 快捷键 */}
      <div className="status-hint">
        {compactDisabled && (
          <span
            className="compact-badge compact-badge-warn"
            title="自动压缩已因连续失败而熔断，长篇续写可能受影响"
          >⚠ 压缩熔断</span>
        )}
        {!compactDisabled && compactionCount > 0 && (
          <span
            className="compact-badge"
            title={`上下文已自动压缩 ${compactionCount} 次，早期内容以摘要形式保留`}
          >📦 ×{compactionCount}</span>
        )}
        {showSaved && (
          <span className="status-saved">✓ 已保存</span>
        )}
        <kbd>Ctrl</kbd>
        <span>+</span>
        <kbd>Enter</kbd>
        <span>续写</span>
      </div>
    </footer>
  );
}
