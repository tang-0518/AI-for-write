// =============================================================
// components/ContextInspector.tsx — AI 上下文可视化面板
//
// 【目的】
//   消除"黑盒感"：让用户清楚看到当次 AI 调用注入了哪些内容、
//   来自哪里（知识图谱 vs 本地），以及各 section 消耗了多少 token。
//
// 【布局】
//   紧凑模式（默认）：一行进度条 + 来源徽标 + 展开按钮
//   展开模式：每个 section 一行，列出被选中的实体名列表
//
// 【Props】
//   bundle   — ContextBundle（来自 memoryService）
//   compact  — 是否默认折叠（true = 只显示进度条，点击展开）
// =============================================================

import { useState } from 'react';
import type { ContextBundle, ContextSection } from '../api/memoryService';

interface ContextInspectorProps {
  bundle:   ContextBundle | null;
  compact?: boolean;
}

// ── token 进度条颜色 ──────────────────────────────────────────
function barColor(ratio: number): string {
  if (ratio > 0.9) return '#f87171'; // 红：快满了
  if (ratio > 0.7) return '#fbbf24'; // 黄：较多
  return '#60a5fa';                   // 蓝：正常
}

// ── 来源徽标 ─────────────────────────────────────────────────
function SourceBadge({ source }: { source: 'kg' | 'local' }) {
  return source === 'kg'
    ? <span className="ci-badge ci-badge-kg" title="来自知识图谱（MCP）">KG</span>
    : <span className="ci-badge ci-badge-local" title="来自本地 IndexedDB">本地</span>;
}

// ── 单个 Section 行 ───────────────────────────────────────────
function SectionRow({ sec }: { sec: ContextSection }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ci-section">
      <div className="ci-section-header" onClick={() => setOpen(o => !o)}>
        <span className="ci-section-emoji">{sec.emoji}</span>
        <span className="ci-section-label">{sec.label}</span>
        <SourceBadge source={sec.source} />
        <div className="ci-section-bar-wrap">
          <div
            className="ci-section-bar"
            style={{
              width:      `${Math.min(100, (sec.tokenCount / sec.tokenBudget) * 100)}%`,
              background: barColor(sec.tokenCount / sec.tokenBudget),
            }}
          />
        </div>
        <span className="ci-section-tokens">{sec.tokenCount}</span>
        {sec.excluded.length > 0 && (
          <span className="ci-section-overflow" title={`${sec.excluded.length} 条因超限被截断`}>
            +{sec.excluded.length}↩
          </span>
        )}
        <span className="ci-chevron">{open ? '▾' : '▸'}</span>
      </div>

      {open && (
        <div className="ci-section-body">
          {sec.included.length === 0 ? (
            <span className="ci-empty">（空）</span>
          ) : (
            <div className="ci-pill-row">
              {sec.included.map(e => (
                <span key={e.id} className="ci-pill" title={e.summary}>
                  {e.name}
                </span>
              ))}
            </div>
          )}
          {sec.excluded.length > 0 && (
            <div className="ci-pill-row ci-pill-row-excluded">
              <span className="ci-excluded-label">未注入：</span>
              {sec.excluded.map(e => (
                <span key={e.id} className="ci-pill ci-pill-excluded" title="token 预算不足，未注入">
                  {e.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────
export function ContextInspector({ bundle, compact = true }: ContextInspectorProps) {
  const [expanded, setExpanded] = useState(!compact);

  if (!bundle) {
    return (
      <div className="ci-root ci-empty-root">
        <span className="ci-empty-text">上下文未加载</span>
      </div>
    );
  }

  const ratio     = bundle.totalBudget > 0 ? bundle.totalTokens / bundle.totalBudget : 0;
  const pct       = Math.round(ratio * 100);
  const usedColor = barColor(ratio);
  const nonEmpty  = bundle.sections.filter(s => s.included.length > 0);

  return (
    <div className="ci-root">
      {/* ── 紧凑头部：进度条 + 摘要 ─────────────────────────── */}
      <div className="ci-header" onClick={() => setExpanded(e => !e)}>
        <span className="ci-icon">🧠</span>
        <span className="ci-title">上下文</span>

        {/* KG 状态指示 */}
        {bundle.kgAvailable
          ? <span className="ci-badge ci-badge-kg ci-kg-status">KG ✓</span>
          : <span className="ci-badge ci-badge-offline ci-kg-status" title="知识图谱服务不可用，使用本地数据">KG ✗</span>
        }

        {/* 全局进度条 */}
        <div className="ci-global-bar-wrap">
          <div
            className="ci-global-bar"
            style={{ width: `${Math.min(100, pct)}%`, background: usedColor }}
          />
        </div>

        <span className="ci-token-text" style={{ color: usedColor }}>
          {bundle.totalTokens}<span className="ci-token-sep">/</span>{bundle.totalBudget}
        </span>
        <span className="ci-token-pct">{pct}%</span>

        <span className="ci-chevron-main">{expanded ? '▾' : '▸'}</span>
      </div>

      {/* ── 展开：section 明细 ────────────────────────────────── */}
      {expanded && (
        <div className="ci-body">
          {nonEmpty.length === 0 ? (
            <div className="ci-empty">没有注入任何上下文，完成章节或添加角色后刷新。</div>
          ) : (
            bundle.sections.map(sec => (
              <SectionRow key={sec.key} sec={sec} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default ContextInspector;
