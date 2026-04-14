// =============================================================
// components/CapsuleCard.tsx — 单个角色胶囊卡片
// =============================================================

import { useState } from 'react';
import type { CharacterCapsule } from '../capsule/types';
import { buildCapsuleDetailText } from '../capsule/promptBuilder';

interface CapsuleCardProps {
  capsule:    CharacterCapsule;
  onEdit:     (cap: CharacterCapsule) => void;
  onDelete:   (id: string) => void;
  onInject?:  (snippet: string) => void;  // 注入到当前写作上下文
  onViewGraph?: (name: string) => void;   // 跳转到图谱
}

export function CapsuleCard({
  capsule, onEdit, onDelete, onInject, onViewGraph,
}: CapsuleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied,   setCopied]   = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildCapsuleDetailText(capsule));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const s = capsule.currentState;
  const hasState = s.goal || s.mood || s.powerLevel || s.secrets.length > 0;

  return (
    <div className="cc-card" style={{ '--cc-color': capsule.color } as React.CSSProperties}>
      {/* ── 卡片头部 ── */}
      <div className="cc-header" onClick={() => setExpanded(e => !e)}>
        <div className="cc-avatar" style={{ background: capsule.color }}>
          {capsule.name.slice(0, 1)}
        </div>
        <div className="cc-meta">
          <span className="cc-name">{capsule.name}</span>
          {capsule.identity && (
            <span className="cc-identity">{capsule.identity}</span>
          )}
        </div>
        <div className="cc-badges">
          {capsule.autoExtracted && (
            <span className="cc-badge-ai" title="AI 自动提取">🤖</span>
          )}
          <span className="cc-token-hint">~{capsule.tokenEstimate}t</span>
          <span className="cc-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── 展开内容 ── */}
      {expanded && (
        <div className="cc-body">
          {capsule.personality && (
            <div className="cc-field">
              <span className="cc-field-label">性格</span>
              <span className="cc-field-value">{capsule.personality}</span>
            </div>
          )}
          {capsule.voice && (
            <div className="cc-field">
              <span className="cc-field-label">声音</span>
              <span className="cc-field-value">{capsule.voice}</span>
            </div>
          )}
          {capsule.appearance && (
            <div className="cc-field">
              <span className="cc-field-label">外貌</span>
              <span className="cc-field-value">{capsule.appearance}</span>
            </div>
          )}
          {capsule.backstory && (
            <div className="cc-field">
              <span className="cc-field-label">背景</span>
              <span className="cc-field-value cc-field-long">{capsule.backstory}</span>
            </div>
          )}

          {/* 当前状态 */}
          {hasState && (
            <div className="cc-state-block">
              <div className="cc-state-title">
                当前状态
                {s.chapter > 0 && (
                  <span className="cc-state-chapter">第 {s.chapter} 章</span>
                )}
              </div>
              {s.goal       && <div className="cc-state-row"><span>目标</span>{s.goal}</div>}
              {s.mood       && <div className="cc-state-row"><span>情绪</span>{s.mood}</div>}
              {s.powerLevel && <div className="cc-state-row"><span>状态</span>{s.powerLevel}</div>}
              {s.secrets.length > 0 && (
                <div className="cc-state-row cc-state-secret">
                  <span>隐瞒</span>
                  <span>{s.secrets.join('；')}</span>
                </div>
              )}
              {s.knownFacts.length > 0 && (
                <div className="cc-state-row">
                  <span>已知</span>
                  <span>{s.knownFacts.join('；')}</span>
                </div>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="cc-actions">
            {onInject && (
              <button className="cc-btn cc-btn-primary"
                onClick={() => onInject(capsule.promptSnippet)}
                title="将此胶囊注入当前写作上下文">
                注入写作
              </button>
            )}
            <button className="cc-btn" onClick={() => onEdit(capsule)}>编辑</button>
            {onViewGraph && (
              <button className="cc-btn" onClick={() => onViewGraph(capsule.name)}>
                图谱
              </button>
            )}
            <button className="cc-btn" onClick={handleCopy}>
              {copied ? '已复制' : '复制'}
            </button>
            <button className="cc-btn cc-btn-danger"
              onClick={() => {
                if (confirm(`确认删除「${capsule.name}」的角色胶囊？`)) onDelete(capsule.id);
              }}>
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
