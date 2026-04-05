// =============================================================
// components/ConsistencyPanel.tsx — AI 一致性检查结果面板
// =============================================================

import type { ConsistencyIssue } from '../api/gemini';

interface ConsistencyPanelProps {
  issues: ConsistencyIssue[] | null;
  isChecking: boolean;
  error: string | null;
  onCheck: () => void;
  onClose: () => void;
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: '严重', color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
  medium: { label: '中等', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
  low:    { label: '轻微', color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
};

export function ConsistencyPanel({ issues, isChecking, error, onCheck, onClose }: ConsistencyPanelProps) {
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel consistency-panel">
        <div className="modal-header">
          <span className="modal-title">🔍 一致性检查</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!isChecking && issues === null && !error && (
            <p className="consistency-desc">
              点击「开始检查」，AI 将对比本章内容与记忆库中的真相文件，找出矛盾之处。
              <br />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                需要先完成章节以生成真相文件。
              </span>
            </p>
          )}

          {error && (
            <div className="cc-error">
              <span className="cc-error-msg">⚠️ {error}</span>
            </div>
          )}

          {isChecking && (
            <div className="cc-extracting">
              <span className="cc-spinner" />
              <span>AI 正在检查一致性，请稍候…</span>
            </div>
          )}

          {!isChecking && issues !== null && (
            issues.length === 0 ? (
              <div className="consistency-ok">
                ✅ 未发现明显不一致，章节内容与设定吻合。
              </div>
            ) : (
              <div className="consistency-results">
                <div className="consistency-count">共发现 {issues.length} 处问题</div>
                <div className="consistency-issue-list">
                  {issues.map((issue, i) => {
                    const meta = SEVERITY_META[issue.severity] ?? SEVERITY_META.low;
                    return (
                      <div
                        key={i}
                        className="consistency-issue-item"
                        style={{ background: meta.bg }}
                      >
                        <div className="consistency-issue-header">
                          <span className="consistency-severity" style={{ color: meta.color }}>
                            [{meta.label}]
                          </span>
                        </div>
                        <div className="consistency-issue-desc">{issue.description}</div>
                        <div className="consistency-issue-suggestion">💡 {issue.suggestion}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
          <button className="btn btn-primary" onClick={onCheck} disabled={isChecking}>
            {isChecking ? '检查中…' : '开始检查'}
          </button>
        </div>
      </div>
    </div>
  );
}
