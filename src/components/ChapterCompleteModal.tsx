// =============================================================
// components/ChapterCompleteModal.tsx — 章节完成确认模态框
//
// 自己持有处理状态，调用 completeChapter() 驱动三步流程。
// 完成后通过 onDone(summary) 把摘要回传给 App 更新 Draft 侧边栏。
// =============================================================

import { useState } from 'react';
import { completeChapter } from '../memory/completeChapter';
import type { CompleteChapterResult, StepKey } from '../memory/completeChapter';
import type { Draft } from '../hooks/useBooks';
import type { AppSettings } from '../types';

interface ChapterCompleteModalProps {
  draft: Draft;
  wordCount: number;
  settings: AppSettings;
  bookId: string;
  saveSnapshot: (content: string, title: string, label: string) => Promise<void>;
  /** 处理完成后调用：传回摘要供 App 更新 Draft；App 负责刷新记忆列表 */
  onDone: (summary: string) => void;
  onClose: () => void;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

interface Progress {
  summary: boolean;
  entities: boolean;
  graph: boolean;
  snapshot: boolean;
  tension: boolean;
  chapterState: boolean;
  weightUpdate: boolean;
}

const STEPS: Array<{ key: keyof Progress; label: string; emoji: string }> = [
  { key: 'summary',      label: '生成章节摘要',   emoji: '📖' },
  { key: 'entities',     label: '提取角色与设定', emoji: '🧠' },
  { key: 'graph',        label: '更新知识图谱',   emoji: '🕸️' },
  { key: 'snapshot',     label: '保存章节快照',   emoji: '💾' },
  { key: 'tension',      label: '张力评分',       emoji: '📊' },
  { key: 'chapterState', label: '提取伏笔与时间线', emoji: '🪝' },
  { key: 'weightUpdate', label: '更新关系权重',   emoji: '⚖️' },
];

export function ChapterCompleteModal({
  draft,
  wordCount,
  settings,
  bookId,
  saveSnapshot,
  onDone,
  onClose,
}: ChapterCompleteModalProps) {
  const [status,   setStatus]   = useState<Status>('idle');
  const [progress, setProgress] = useState<Progress>({
    summary: false,
    entities: false,
    graph: false,
    snapshot: false,
    tension: false,
    chapterState: false,
    weightUpdate: false,
  });
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<CompleteChapterResult | null>(null);

  async function handleConfirm() {
    if (!settings.apiKey) { setError('请先在设置中填写 API Key'); setStatus('error'); return; }
    if (!draft.content.trim()) { setError('章节内容为空，无法处理'); setStatus('error'); return; }

    setStatus('loading');
    setError(null);
    setResult(null);
    setProgress({
      summary: false,
      entities: false,
      graph: false,
      snapshot: false,
      tension: false,
      chapterState: false,
      weightUpdate: false,
    });

    const handleStepDone = (step: StepKey) => {
      setProgress(p => ({ ...p, [step]: true }));
    };

    const res = await completeChapter(draft, settings, bookId, saveSnapshot, handleStepDone);

    setResult(res);
    setStatus('done');
    onDone(res.summary);  // 无论摘要是否生成，都通知 App 刷新记忆列表
  }

  function handleClose() {
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="modal-panel chapter-complete-modal">
        <div className="modal-header">
          <span className="modal-title">✓ 完成章节</span>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        {/* ── 确认阶段 ── */}
        {status === 'idle' && (
          <>
            <div className="modal-body">
              <div className="cc-chapter-info">
                <span className="cc-chapter-name">《{draft.title}》</span>
                <span className={`cc-word-count ${wordCount >= 1000 ? 'cc-word-ok' : 'cc-word-warn'}`}>
                  {wordCount.toLocaleString()} 字
                </span>
              </div>
              <p className="cc-desc">AI 将自动更新知识库，供后续章节续写时参考。</p>
              <div className="cc-truth-list">
                {STEPS.map(s => (
                  <div key={s.key} className="cc-truth-item">
                    <span className="cc-truth-icon">{s.emoji}</span>
                    <span className="cc-truth-name">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={handleClose}>取消</button>
              <button className="btn btn-complete" onClick={handleConfirm}>🚀 开始处理</button>
            </div>
          </>
        )}

        {/* ── 处理中 ── */}
        {status === 'loading' && (
          <div className="modal-body">
            <div className="cc-extracting">
              <span className="cc-spinner" />
              <span>AI 正在处理章节…</span>
            </div>
            <div className="cc-truth-list">
              {STEPS.map(s => (
                <div key={s.key} className={`cc-truth-item ${progress[s.key] ? 'cc-truth-done' : 'cc-truth-pending'}`}>
                  <span className="cc-truth-icon">
                    {progress[s.key] ? '✅' : <span className="cc-step-spinner" />}
                  </span>
                  <span className="cc-truth-name">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 完成阶段 ── */}
        {status === 'done' && result && (
          <>
            <div className="modal-body">
              <div className="cc-result-header">
                <span className="cc-result-ok">✅ 章节处理完成</span>
              </div>
              <div className="cc-result-stats">
                {result.summary && (
                  <div className="cc-result-stat">
                    <span className="cc-result-stat-icon">📖</span>
                    <span className="cc-result-stat-text">已生成章节摘要</span>
                  </div>
                )}
                {result.entities.filter(e => e.type === 'character').length > 0 && (
                  <div className="cc-result-stat">
                    <span className="cc-result-stat-icon">👤</span>
                    <span className="cc-result-stat-text">
                      更新 <strong>{result.entities.filter(e => e.type === 'character').length}</strong> 个角色档案
                    </span>
                  </div>
                )}
                {result.entities.filter(e => e.type === 'world_rule').length > 0 && (
                  <div className="cc-result-stat">
                    <span className="cc-result-stat-icon">🌍</span>
                    <span className="cc-result-stat-text">
                      更新 <strong>{result.entities.filter(e => e.type === 'world_rule').length}</strong> 条世界设定
                    </span>
                  </div>
                )}
                {result.entities.length === 0 && !result.summary && (
                  <div className="cc-result-stat cc-result-empty">
                    <span className="cc-result-stat-icon">ℹ️</span>
                    <span className="cc-result-stat-text">本章无新增知识库条目</span>
                  </div>
                )}
                {(result.graph.entityCount > 0 || result.graph.relationCount > 0) && (
                  <div className="cc-result-stat">
                    <span className="cc-result-stat-icon">🕸️</span>
                    <span className="cc-result-stat-text">
                      图谱新增 <strong>{result.graph.entityCount}</strong> 实体、<strong>{result.graph.relationCount}</strong> 关系
                    </span>
                  </div>
                )}
                <div className="cc-result-stat">
                  <span className="cc-result-stat-icon">💾</span>
                  <span className="cc-result-stat-text">已保存章节快照</span>
                </div>
              </div>

              {result.entities.length > 0 && (
                <div className="cc-entities-preview">
                  <div className="cc-entities-title">提取内容预览</div>
                  {result.entities.slice(0, 6).map((e, i) => (
                    <div key={i} className="cc-entity-item">
                      <span className={`cc-entity-type ${e.type === 'character' ? 'cc-type-char' : 'cc-type-world'}`}>
                        {e.type === 'character' ? '角色' : '设定'}
                      </span>
                      <span className="cc-entity-name">{e.name}</span>
                      <span className="cc-entity-content">{e.content.slice(0, 40)}{e.content.length > 40 ? '…' : ''}</span>
                    </div>
                  ))}
                  {result.entities.length > 6 && (
                    <div className="cc-entities-more">…还有 {result.entities.length - 6} 条，在知识库中查看</div>
                  )}
                </div>
              )}

              {result.tension && (
                <div className="cc-tension">
                  <div className="cc-tension-title">📊 章节张力评分</div>
                  {(
                    [
                      { label: '情节张力', score: result.tension.plotTension,      note: result.tension.plotJustification },
                      { label: '情绪张力', score: result.tension.emotionalTension, note: result.tension.emotionalJustification },
                      { label: '节奏张力', score: result.tension.pacingTension,    note: result.tension.pacingJustification },
                    ] as const
                  ).map(({ label, score, note }) => (
                    <div key={label} className="cc-tension-row">
                      <span className="cc-tension-label">{label}</span>
                      <div className="cc-tension-bar-wrap">
                        <div
                          className="cc-tension-bar"
                          style={{
                            width: `${score}%`,
                            backgroundColor: score >= 70 ? '#34d399' : score >= 40 ? '#fbbf24' : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="cc-tension-score">{score}</span>
                      {note && <span className="cc-tension-note">{note}</span>}
                    </div>
                  ))}
                  <div className="cc-tension-composite">综合：{result.tension.composite} / 100</div>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="cc-step-errors">
                  {result.errors.map((e, i) => (
                    <div key={i} className="cc-step-error-item">⚠️ {e.step}：{e.message}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={handleClose}>完成</button>
            </div>
          </>
        )}

        {/* ── 严重错误 ── */}
        {status === 'error' && (
          <>
            <div className="modal-body">
              <div className="cc-error">
                <span className="cc-error-msg">⚠️ {error ?? '处理失败'}</span>
                <span className="cc-error-hint">请检查 API Key 和网络后重试</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={handleClose}>关闭</button>
              <button className="btn btn-primary" onClick={handleConfirm}>重试</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ChapterCompleteModal;
