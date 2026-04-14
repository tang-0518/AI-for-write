// =============================================================
// components/PlotHooksPanel.tsx — 情节钩子管理面板
// 概念来源：InkOS plot-hooks 架构（pending/resolved/deferred 状态机）
// =============================================================

import { useState } from 'react';
import type { PlotHook, PlotHookStatus, PlotHookPriority } from '../memory/types';
import { PLOT_HOOK_STATUS_META, PLOT_HOOK_PRIORITY_META } from '../memory/types';
import type { CreateInput } from '../hooks/usePlotHooks';

interface PlotHooksPanelProps {
  hooks: PlotHook[];
  onAdd: (input: CreateInput) => Promise<void>;
  onUpdate: (id: string, changes: Partial<PlotHook>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onResolve: (id: string, chapterResolved?: string) => Promise<void>;
  onDefer: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
  onClose: () => void;
}

type FilterStatus = PlotHookStatus | 'all';

export function PlotHooksPanel({
  hooks, onAdd, onUpdate, onRemove, onResolve, onDefer, onReopen, onClose,
}: PlotHooksPanelProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 新增表单状态
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<PlotHookPriority>('medium');
  const [newChapter, setNewChapter] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // 编辑表单状态
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<PlotHookPriority>('medium');

  const filteredHooks = filter === 'all' ? hooks : hooks.filter(h => h.status === filter);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setIsAdding(true);
    try {
      await onAdd({
        title: newTitle.trim(),
        description: newDesc.trim(),
        priority: newPriority,
        chapterCreated: newChapter.trim() || undefined,
        status: 'pending' as PlotHookStatus,
      });
      setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setNewChapter('');
      setShowAdd(false);
    } finally {
      setIsAdding(false);
    }
  };

  const startEdit = (hook: PlotHook) => {
    setEditingId(hook.id);
    setEditTitle(hook.title);
    setEditDesc(hook.description);
    setEditPriority(hook.priority);
  };

  const handleEditSave = async (id: string) => {
    await onUpdate(id, { title: editTitle.trim(), description: editDesc.trim(), priority: editPriority });
    setEditingId(null);
  };

  const counts = {
    all: hooks.length,
    pending: hooks.filter(h => h.status === 'pending').length,
    resolved: hooks.filter(h => h.status === 'resolved').length,
    deferred: hooks.filter(h => h.status === 'deferred').length,
  };

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel plot-hooks-panel">
        <div className="modal-header">
          <span className="modal-title">🎣 情节钩子</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 过滤标签栏 */}
        <div className="ph-filter-bar">
          {(['all', 'pending', 'resolved', 'deferred'] as const).map(s => (
            <button
              key={s}
              className={`ph-filter-btn ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? `全部 (${counts.all})` : `${PLOT_HOOK_STATUS_META[s].emoji} ${PLOT_HOOK_STATUS_META[s].label} (${counts[s]})`}
            </button>
          ))}
          <button
            className="btn btn-primary ph-add-btn"
            onClick={() => setShowAdd(v => !v)}
          >
            {showAdd ? '✕ 取消' : '+ 新增'}
          </button>
        </div>

        {/* 新增表单 */}
        {showAdd && (
          <div className="ph-add-form">
            <input
              className="ph-input"
              placeholder="钩子标题（必填）…"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              maxLength={80}
              autoFocus
            />
            <textarea
              className="ph-textarea"
              placeholder="详细描述（伏笔内容、承诺等）…"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              rows={2}
            />
            <div className="ph-form-row">
              <label className="ph-label">优先级</label>
              <select className="ph-select" value={newPriority} onChange={e => setNewPriority(e.target.value as PlotHookPriority)}>
                {(Object.entries(PLOT_HOOK_PRIORITY_META) as [PlotHookPriority, typeof PLOT_HOOK_PRIORITY_META[PlotHookPriority]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}优先级</option>
                ))}
              </select>
              <input
                className="ph-input ph-chapter-input"
                placeholder="埋下的章节名（可选）"
                value={newChapter}
                onChange={e => setNewChapter(e.target.value)}
                maxLength={40}
              />
            </div>
            <div className="ph-form-actions">
              <button className="btn btn-primary" onClick={handleAdd} disabled={!newTitle.trim() || isAdding}>
                {isAdding ? '添加中…' : '添加钩子'}
              </button>
            </div>
          </div>
        )}

        {/* 钩子列表 */}
        <div className="modal-body ph-list">
          {filteredHooks.length === 0 && (
            <div className="ph-empty">
              {filter === 'all' ? '暂无情节钩子，点击「新增」添加第一个伏笔' : '该状态下暂无钩子'}
            </div>
          )}
          {filteredHooks.map(hook => {
            const statusMeta = PLOT_HOOK_STATUS_META[hook.status];
            const priorityMeta = PLOT_HOOK_PRIORITY_META[hook.priority];
            const isEditing = editingId === hook.id;

            return (
              <div key={hook.id} className={`ph-item ph-status-${hook.status}`}>
                {isEditing ? (
                  <div className="ph-edit-form">
                    <input
                      className="ph-input"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      maxLength={80}
                      autoFocus
                    />
                    <textarea
                      className="ph-textarea"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      rows={2}
                    />
                    <div className="ph-form-row">
                      <label className="ph-label">优先级</label>
                      <select className="ph-select" value={editPriority} onChange={e => setEditPriority(e.target.value as PlotHookPriority)}>
                        {(Object.entries(PLOT_HOOK_PRIORITY_META) as [PlotHookPriority, typeof PLOT_HOOK_PRIORITY_META[PlotHookPriority]][]).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}优先级</option>
                        ))}
                      </select>
                    </div>
                    <div className="ph-form-actions">
                      <button className="btn btn-primary" onClick={() => handleEditSave(hook.id)}>保存</button>
                      <button className="btn btn-ghost" onClick={() => setEditingId(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ph-item-header">
                      <span className="ph-item-status" title={statusMeta.label}>{statusMeta.emoji}</span>
                      <span className="ph-item-title">{hook.title}</span>
                      <span className="ph-item-priority" style={{ color: priorityMeta.color }}>{priorityMeta.label}</span>
                    </div>
                    {hook.description && (
                      <div className="ph-item-desc">{hook.description}</div>
                    )}
                    {(hook.chapterCreated || hook.chapterResolved) && (
                      <div className="ph-item-chapters">
                        {hook.chapterCreated && <span>埋于：{hook.chapterCreated}</span>}
                        {hook.chapterResolved && <span>解于：{hook.chapterResolved}</span>}
                      </div>
                    )}
                    <div className="ph-item-actions">
                      {hook.status === 'pending' && (
                        <>
                          <button className="btn btn-ghost ph-action-btn" onClick={() => onResolve(hook.id)} title="标记为已解决">✅ 解决</button>
                          <button className="btn btn-ghost ph-action-btn" onClick={() => onDefer(hook.id)} title="延期处理">⏸️ 延期</button>
                        </>
                      )}
                      {hook.status !== 'pending' && (
                        <button className="btn btn-ghost ph-action-btn" onClick={() => onReopen(hook.id)} title="重新开放">↩️ 重开</button>
                      )}
                      <button className="btn btn-ghost ph-action-btn" onClick={() => startEdit(hook)} title="编辑">✎ 编辑</button>
                      <button
                        className="btn btn-ghost ph-action-btn ph-delete-btn"
                        onClick={() => { if (window.confirm(`删除「${hook.title}」？`)) onRemove(hook.id); }}
                        title="删除"
                      >
                        🗑
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          <span className="ph-footer-hint">高优先级未解决：<strong>{hooks.filter(h => h.status === 'pending' && h.priority === 'high').length}</strong> 个</span>
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

export default PlotHooksPanel;
