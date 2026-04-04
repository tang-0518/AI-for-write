// =============================================================
// components/MemoryPanel.tsx — 记忆库面板（仿 Claude Code memdir）
// =============================================================

import { useState } from 'react';
import type { MemoryEntry, MemoryType } from '../memory/types';
import { MEMORY_TYPE_META } from '../memory/types';

interface MemoryPanelProps {
  entries: MemoryEntry[];
  onAdd: (e: { name: string; description: string; type: MemoryType; content: string }) => Promise<MemoryEntry> | void;
  onUpdate: (id: string, patch: Partial<Omit<MemoryEntry, 'id' | 'updatedAt'>>) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
  onClose: () => void;
}

const ALL_TYPES: MemoryType[] = ['project', 'feedback', 'reference', 'user'];

const BLANK = { name: '', description: '', type: 'project' as MemoryType, content: '' };

export function MemoryPanel({ entries, onAdd, onUpdate, onRemove, onClose }: MemoryPanelProps) {
  const [filter, setFilter]       = useState<MemoryType | 'all'>('all');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm]           = useState(BLANK);

  const visible = filter === 'all' ? entries : entries.filter(e => e.type === filter);
  const sorted  = [...visible].sort((a, b) => b.updatedAt - a.updatedAt);

  const openNew = () => {
    setForm(BLANK);
    setEditingId('new');
  };

  const openEdit = (e: MemoryEntry) => {
    setForm({ name: e.name, description: e.description, type: e.type, content: e.content });
    setEditingId(e.id);
  };

  const cancelEdit = () => { setEditingId(null); setForm(BLANK); };

  const commitEdit = () => {
    if (!form.name.trim() || !form.content.trim()) return;
    if (editingId === 'new') {
      onAdd(form);
    } else if (editingId) {
      onUpdate(editingId, form);
    }
    cancelEdit();
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="memory-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="memory-panel">

        {/* 头部 */}
        <div className="memory-header">
          <div className="memory-header-left">
            <span className="memory-title">记忆库</span>
            <span className="memory-count">{entries.length} 条</span>
          </div>
          <div className="memory-header-right">
            <button className="memory-add-btn" onClick={openNew} title="新增记忆">+ 新增</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* 类型筛选 */}
        <div className="memory-filters">
          <button
            className={`memory-filter-btn ${filter === 'all' ? 'memory-filter-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 <span className="memory-filter-count">{entries.length}</span>
          </button>
          {ALL_TYPES.map(t => {
            const meta = MEMORY_TYPE_META[t];
            const count = entries.filter(e => e.type === t).length;
            return (
              <button
                key={t}
                className={`memory-filter-btn ${filter === t ? 'memory-filter-active' : ''}`}
                style={filter === t ? { color: meta.color, borderColor: meta.color + '55' } : {}}
                onClick={() => setFilter(t)}
              >
                {meta.label}
                {count > 0 && <span className="memory-filter-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* 编辑表单 */}
        {editingId !== null && (
          <div className="memory-form">
            <div className="memory-form-row">
              <input
                className="memory-form-input"
                placeholder="标题（简短）"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                autoFocus
              />
              <select
                className="memory-form-select"
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value as MemoryType }))}
              >
                {ALL_TYPES.map(t => (
                  <option key={t} value={t}>{MEMORY_TYPE_META[t].label}</option>
                ))}
              </select>
            </div>
            <input
              className="memory-form-input"
              placeholder="一行摘要（显示在索引中）"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            />
            <textarea
              className="memory-form-textarea"
              placeholder="完整内容…"
              rows={4}
              value={form.content}
              onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
            />
            <div className="memory-form-actions">
              <button className="btn btn-ghost" onClick={cancelEdit}>取消</button>
              <button
                className="btn btn-primary"
                onClick={commitEdit}
                disabled={!form.name.trim() || !form.content.trim()}
              >
                {editingId === 'new' ? '保存' : '更新'}
              </button>
            </div>
          </div>
        )}

        {/* 记忆列表 */}
        <div className="memory-list">
          {sorted.length === 0 && (
            <div className="memory-empty">
              {filter === 'all'
                ? '还没有记忆。点击「+ 新增」开始记录人物、情节、写作习惯…'
                : `还没有「${MEMORY_TYPE_META[filter as MemoryType]?.label}」类记忆`}
            </div>
          )}
          {sorted.map(e => {
            const meta = MEMORY_TYPE_META[e.type];
            return (
              <div key={e.id} className="memory-item">
                <div className="memory-item-header">
                  <span className="memory-type-badge" style={{ color: meta.color, borderColor: meta.color + '44' }}>
                    {meta.label}
                  </span>
                  <span className="memory-item-name">{e.name}</span>
                  <span className="memory-item-date">{formatDate(e.updatedAt)}</span>
                  <div className="memory-item-actions">
                    <button className="memory-action-btn" onClick={() => openEdit(e)} title="编辑">✎</button>
                    <button className="memory-action-btn memory-action-delete" onClick={() => onRemove(e.id)} title="删除">✕</button>
                  </div>
                </div>
                {e.description && (
                  <div className="memory-item-desc">{e.description}</div>
                )}
                <div className="memory-item-content">{e.content}</div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
