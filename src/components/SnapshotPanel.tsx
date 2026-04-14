// =============================================================
// components/SnapshotPanel.tsx — 章节版本历史面板
// =============================================================

import type { Snapshot } from '../hooks/useSnapshots';

interface SnapshotPanelProps {
  snapshots: Snapshot[];
  overLimitWarning: boolean;
  onRestore: (content: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onManualSave: () => void;
  onDismissWarning: () => void;
  onClose: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SnapshotPanel({
  snapshots, overLimitWarning,
  onRestore, onDelete, onPin, onManualSave, onDismissWarning, onClose,
}: SnapshotPanelProps) {
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel snapshot-panel">
        <div className="modal-header">
          <span className="modal-title">🕐 版本历史</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onManualSave} title="手动存档当前内容">
              📌 存档
            </button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {overLimitWarning && (
          <div className="snapshot-over-limit-warning">
            ⚠️ 快照已达 20 条上限，且所有快照均已标为重要——请手动删除不需要的条目后再存档。
            <button className="btn btn-ghost btn-sm" onClick={onDismissWarning}>知道了</button>
          </div>
        )}

        <div className="snapshot-panel-body">
          {snapshots.length === 0 ? (
            <div className="snapshot-empty">
              <span className="snapshot-empty-icon">📂</span>
              <span>暂无版本记录。点击「存档」或完成章节时自动保存。</span>
            </div>
          ) : (
            <div className="snapshot-list">
              {snapshots.map(snap => (
                <div key={snap.id} className={`snapshot-item${snap.pinned ? ' snapshot-pinned' : ''}`}>
                  <div className="snapshot-item-meta">
                    <span className="snapshot-item-label">
                      {snap.pinned && <span className="snapshot-pin-badge" title="已标记为重要">📌 </span>}
                      {snap.label}
                    </span>
                    <span className="snapshot-item-time">{formatTime(snap.createdAt)}</span>
                    <span className="snapshot-item-words">
                      {snap.content.replace(/\s/g, '').length} 字
                    </span>
                  </div>
                  <div className="snapshot-preview">
                    {snap.content.slice(0, 120)}
                    {snap.content.length > 120 ? '…' : ''}
                  </div>
                  <div className="snapshot-item-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { if (window.confirm('恢复此版本？当前内容将被覆盖。')) onRestore(snap.content); }}
                    >
                      ↩ 恢复
                    </button>
                    <button
                      className={`btn btn-ghost btn-sm${snap.pinned ? ' snapshot-pin-active' : ''}`}
                      title={snap.pinned ? '取消重要标记' : '标记为重要（不会被自动删除）'}
                      onClick={() => onPin(snap.id, !snap.pinned)}
                    >
                      {snap.pinned ? '📌' : '☆'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--text-muted)' }}
                      onClick={() => { if (window.confirm('删除此快照？')) onDelete(snap.id); }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SnapshotPanel;
