// =============================================================
// components/ChapterCompleteModal.tsx — 章节完成确认模态框
// =============================================================

import type { ChapterCompleteStatus } from '../hooks/useChapterComplete';
import { TRUTH_FILE_META } from '../memory/types';
import type { TruthFileType } from '../memory/types';

const TRUTH_FILE_TYPES: TruthFileType[] = [
  'current_state', 'particle_ledger', 'pending_hooks',
  'character_web', 'world_rules', 'foreshadow_log', 'pov_voice',
];

const TRUTH_FILE_ICONS: Record<TruthFileType, string> = {
  current_state:   '🌍',
  particle_ledger: '💰',
  pending_hooks:   '🪝',
  character_web:   '👥',
  world_rules:     '📜',
  foreshadow_log:  '🔮',
  pov_voice:       '🎙️',
};

interface ChapterCompleteModalProps {
  chapterTitle: string;
  wordCount: number;
  status: ChapterCompleteStatus;
  extractedKeys: string[];
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ChapterCompleteModal({
  chapterTitle,
  wordCount,
  status,
  extractedKeys,
  error,
  onConfirm,
  onClose,
}: ChapterCompleteModalProps) {
  const doneSet = new Set(extractedKeys);

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel chapter-complete-modal">
        <div className="modal-header">
          <span className="modal-title">✓ 完成章节</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {status === 'idle' && (
          <>
            <div className="modal-body">
              <div className="cc-chapter-info">
                <span className="cc-chapter-name">《{chapterTitle}》</span>
                <span className={`cc-word-count ${wordCount >= 1000 ? 'cc-word-ok' : 'cc-word-warn'}`}>
                  {wordCount.toLocaleString()} 字
                </span>
              </div>
              <p className="cc-desc">
                AI 将从本章内容中提取并更新七个真相文件，作为后续章节创作的事实基准。同时自动存档当前版本。
              </p>
              <div className="cc-truth-list">
                {TRUTH_FILE_TYPES.map(t => (
                  <div key={t} className="cc-truth-item">
                    <span className="cc-truth-icon">{TRUTH_FILE_ICONS[t]}</span>
                    <span className="cc-truth-name">{TRUTH_FILE_META[t].name}</span>
                    <span className="cc-truth-desc">{TRUTH_FILE_META[t].description}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>取消</button>
              <button className="btn btn-complete" onClick={onConfirm}>🚀 开始提取</button>
            </div>
          </>
        )}

        {status === 'loading' && (
          <div className="modal-body">
            <div className="cc-extracting">
              <span className="cc-spinner" />
              <span>AI 正在分析章节，提取七个真相文件…（约 10–30 秒）</span>
            </div>
            <div className="cc-truth-list">
              {TRUTH_FILE_TYPES.map(t => (
                <div key={t} className={`cc-truth-item ${doneSet.has(t) ? 'cc-truth-done' : ''}`}>
                  <span className="cc-truth-icon">{doneSet.has(t) ? '✅' : TRUTH_FILE_ICONS[t]}</span>
                  <span className="cc-truth-name">{TRUTH_FILE_META[t].name}</span>
                  <span className="cc-truth-desc">{TRUTH_FILE_META[t].description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'done' && (
          <>
            <div className="modal-body">
              <p className="cc-result-intro">✅ 提取完成！已更新以下真相文件：</p>
              <div className="cc-truth-list">
                {TRUTH_FILE_TYPES.map(t => (
                  <div key={t} className={`cc-truth-item ${doneSet.has(t) ? 'cc-truth-done' : 'cc-truth-skip'}`}>
                    <span className="cc-truth-icon">{doneSet.has(t) ? '✅' : TRUTH_FILE_ICONS[t]}</span>
                    <span className="cc-truth-name">{TRUTH_FILE_META[t].name}</span>
                    {!doneSet.has(t) && <span className="cc-truth-desc">（本章未涉及）</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={onClose}>完成</button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="modal-body">
              <div className="cc-error">
                <span className="cc-error-msg">⚠️ {error ?? '提取失败'}</span>
                <span className="cc-error-hint">请检查 API Key 和网络后重试</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>关闭</button>
              <button className="btn btn-primary" onClick={onConfirm}>重试</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
