// =============================================================
// components/AiDetectionPanel.tsx — 去AI化检测面板
// 概念来源：InkOS anti-detect 模式（11点检测器）
// =============================================================

import { useMemo } from 'react';
import { detectAiPatterns, AI_LEVEL_META } from '../utils/aiDetection';

interface AiDetectionPanelProps {
  content: string;
  onPolishAntiDetect: () => void;
  isPolishing: boolean;
  onClose: () => void;
}

export function AiDetectionPanel({ content, onPolishAntiDetect, isPolishing, onClose }: AiDetectionPanelProps) {
  const result = useMemo(() => detectAiPatterns(content), [content]);
  const levelMeta = AI_LEVEL_META[result.level];

  const scoreColor = levelMeta.color;
  const circumference = 2 * Math.PI * 28; // r=28
  const strokeDashoffset = circumference * (1 - result.score / 100);

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel ai-detect-panel">
        <div className="modal-header">
          <span className="modal-title">🕵️ 去AI化检测</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!content.trim() ? (
            <p className="ai-detect-empty">请先输入内容再进行检测。</p>
          ) : (
            <>
              {/* 得分环 */}
              <div className="ai-detect-score-row">
                <div className="ai-detect-ring-wrap">
                  <svg width="72" height="72" viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r="28" fill="none" stroke="var(--border)" strokeWidth="6" />
                    <circle
                      cx="36" cy="36" r="28"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      transform="rotate(-90 36 36)"
                      style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                    />
                  </svg>
                  <span className="ai-detect-ring-score" style={{ color: scoreColor }}>{result.score}</span>
                </div>
                <div className="ai-detect-summary">
                  <div className="ai-detect-level" style={{ color: scoreColor }}>{levelMeta.label}</div>
                  <div className="ai-detect-desc">{levelMeta.desc}</div>
                  <div className="ai-detect-stats">
                    检测到 <strong>{result.matchCount}</strong> 处问题 · 全文 <strong>{result.totalWords}</strong> 字
                  </div>
                </div>
              </div>

              {/* 问题列表 */}
              {result.matches.length > 0 && (
                <div className="ai-detect-issues">
                  <div className="ai-detect-issues-title">检测到的问题</div>
                  <div className="ai-detect-issue-list">
                    {result.matches.map((m, i) => (
                      <div key={i} className={`ai-detect-issue ai-detect-issue-${m.severity}`}>
                        <div className="ai-detect-issue-header">
                          <span className="ai-detect-issue-phrase">「{m.phrase}」</span>
                          <span className={`ai-detect-badge ai-detect-badge-${m.severity}`}>
                            {m.severity === 'high' ? '高' : m.severity === 'medium' ? '中' : '低'}
                          </span>
                        </div>
                        <div className="ai-detect-issue-pattern">{m.pattern}</div>
                        <div className="ai-detect-issue-suggestion">💡 {m.suggestion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.matches.length === 0 && (
                <div className="ai-detect-ok">
                  ✅ 未检测到明显AI特征，文字自然度良好！
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
          {content.trim() && result.level !== 'low' && (
            <button
              className="btn btn-primary"
              onClick={() => { onPolishAntiDetect(); onClose(); }}
              disabled={isPolishing}
              title="使用「去AI化」模式润色当前内容"
            >
              {isPolishing ? '处理中…' : '🕵️ 一键去AI化'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AiDetectionPanel;
