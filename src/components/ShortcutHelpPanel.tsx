// =============================================================
// components/ShortcutHelpPanel.tsx — 快捷键帮助面板（? 键触发）
// =============================================================

interface ShortcutGroup {
  label: string;
  shortcuts: Array<{ keys: string[]; desc: string }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'AI 操作',
    shortcuts: [
      { keys: ['Ctrl', 'Enter'],       desc: 'AI 续写' },
      { keys: ['Ctrl', 'Shift', 'Enter'], desc: 'AI 润色' },
      { keys: ['Tab'],                 desc: '接受 AI 建议' },
      { keys: ['Esc'],                 desc: '拒绝 AI 建议' },
    ],
  },
  {
    label: '查找与导航',
    shortcuts: [
      { keys: ['Ctrl', 'F'],           desc: '查找' },
      { keys: ['Ctrl', 'H'],           desc: '查找替换' },
      { keys: ['Ctrl', 'Shift', 'F'],  desc: '全书跨章节搜索' },
    ],
  },
  {
    label: '编辑器',
    shortcuts: [
      { keys: ['Ctrl', '='],           desc: '增大字号' },
      { keys: ['Ctrl', '-'],           desc: '减小字号' },
      { keys: ['?'],                   desc: '显示此帮助' },
    ],
  },
];

interface ShortcutHelpPanelProps {
  onClose: () => void;
}

export function ShortcutHelpPanel({ onClose }: ShortcutHelpPanelProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel shortcut-help-panel"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">⌨️ 快捷键一览</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="shortcut-help-body">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.label} className="shortcut-group">
              <div className="shortcut-group-label">{group.label}</div>
              {group.shortcuts.map(({ keys, desc }) => (
                <div key={desc} className="shortcut-row">
                  <div className="shortcut-keys">
                    {keys.map((k, i) => (
                      <span key={i}>
                        <kbd className="shortcut-kbd">{k}</kbd>
                        {i < keys.length - 1 && <span className="shortcut-plus">+</span>}
                      </span>
                    ))}
                  </div>
                  <span className="shortcut-desc">{desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="modal-footer shortcut-help-footer">
          <span className="shortcut-help-hint">按 <kbd className="shortcut-kbd">Esc</kbd> 或点击背景关闭</span>
        </div>
      </div>
    </div>
  );
}
