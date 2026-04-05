// =============================================================
// components/VersionPickerPanel.tsx — 多版本续写选择面板
// =============================================================

interface VersionPickerPanelProps {
  versions: string[];
  onSelect: (version: string) => void;
  onDismiss: () => void;
}

export function VersionPickerPanel({ versions, onSelect, onDismiss }: VersionPickerPanelProps) {
  return (
    <div className="version-picker-overlay" onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="version-picker-panel">
        <div className="version-picker-header">
          <span className="version-picker-title">🎲 选择一个续写版本</span>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss}>✕ 全部丢弃</button>
        </div>
        <div className="version-picker-body">
          {versions.map((v, i) => (
            <div key={i} className="version-card">
              <div className="version-card-label">版本 {i + 1}</div>
              <div className="version-card-preview">{v}</div>
              <div className="version-card-footer">
                <span className="version-card-count">{v.replace(/\s/g, '').length} 字</span>
                <button
                  className="btn btn-primary version-select-btn"
                  onClick={() => onSelect(v)}
                >
                  选用此版本
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
