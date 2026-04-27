import { useMemo, useState } from 'react';
import { useForeshadowings } from '../hooks/useForeshadowings';

interface ForeshadowingPanelProps {
  bookId: string | undefined;
  currentChapter?: number;
}

export function ForeshadowingPanel({ bookId, currentChapter }: ForeshadowingPanelProps) {
  const { pending, resolved, resolve } = useForeshadowings(bookId);
  const [expandedResolved, setExpandedResolved] = useState(false);
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);
  const [resolveChapter, setResolveChapter] = useState('');

  const overdueIds = useMemo(() => new Set(
    pending
      .filter(item => item.suggestedResolveChapter != null
        && currentChapter != null
        && item.suggestedResolveChapter < currentChapter)
      .map(item => item.id),
  ), [currentChapter, pending]);

  const handleResolve = async (id: string) => {
    const chapterNumber = Number(resolveChapter);
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;
    await resolve(id, chapterNumber);
    setResolveTargetId(null);
    setResolveChapter('');
  };

  return (
    <div className="sp-panel sp-panel-scroll">
      <div className="sp-section-header">
        <span className="sp-section-title">伏笔追踪</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <span className="sp-section-badge">待 {pending.length}</span>
          <span className="sp-section-badge">回 {resolved.length}</span>
        </div>
      </div>

      {pending.length === 0 && (
        <div className="sp-empty">暂无待回收伏笔，完成章节后会自动出现。</div>
      )}

      {pending.map(item => {
        const overdue = overdueIds.has(item.id);
        const accentClass = overdue ? 'sp-item-accent-red' : 'sp-item-accent-purple';

        return (
          <div key={item.id} className={`sp-item ${accentClass}`}>
            <div className="sp-item-header">
              <span className="sp-item-meta">第 {item.plantedChapter} 章</span>
              <span className="sp-item-title">{item.description}</span>
              <span className="sp-item-meta">{item.source === 'auto' ? 'AI' : '手动'}</span>
            </div>
            {(item.suggestedResolveChapter != null || overdue) && (
              <div className="sp-item-desc">
                {item.suggestedResolveChapter != null && `预计第 ${item.suggestedResolveChapter} 章回收`}
                {overdue && <span style={{ color: '#f87171', marginLeft: 4 }}>· 已逾期</span>}
              </div>
            )}
            <div className="sp-item-actions">
              {resolveTargetId === item.id ? (
                <>
                  <input
                    className="sp-input"
                    type="number"
                    min={1}
                    style={{ width: 72 }}
                    value={resolveChapter}
                    onChange={(event) => setResolveChapter(event.target.value)}
                    placeholder="章节号"
                  />
                  <button
                    className="btn btn-primary ph-action-btn"
                    type="button"
                    onClick={() => void handleResolve(item.id)}
                  >
                    确认
                  </button>
                  <button
                    className="btn btn-ghost ph-action-btn"
                    type="button"
                    onClick={() => setResolveTargetId(null)}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-ghost ph-action-btn"
                  type="button"
                  onClick={() => {
                    setResolveTargetId(item.id);
                    setResolveChapter(currentChapter ? String(currentChapter) : '');
                  }}
                >
                  回收
                </button>
              )}
            </div>
          </div>
        );
      })}

      <button
        className="btn btn-ghost"
        style={{ width: '100%', marginTop: 4 }}
        type="button"
        onClick={() => setExpandedResolved(value => !value)}
      >
        已回收 {expandedResolved ? '▲' : '▼'}
      </button>

      {expandedResolved && (
        <>
          {resolved.length === 0 && (
            <div className="sp-empty">暂无已回收伏笔。</div>
          )}
          {resolved.map(item => (
            <div key={item.id} className="sp-item sp-item-accent-green sp-item-done">
              <div className="sp-item-header">
                <span className="sp-item-meta">
                  ✓ 第 {item.plantedChapter} 章
                  {item.resolvedChapter ? ` → 第 ${item.resolvedChapter} 章` : ''}
                </span>
                <span className="sp-item-title">{item.description}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default ForeshadowingPanel;
