// =============================================================
// components/MemoryPanel.tsx — 叙事记录面板（章节摘要 + 笔记）
//
// 【精简说明】
//   角色档案 → CharacterPanel（知识图谱 KG）
//   世界设定 → CharacterPanel 世界类实体（KG）
//   章节摘要 → 此面板（IndexedDB，叙事流水账）
//   笔记     → 此面板（IndexedDB，手动）
//
// 此面板现在只管"叙事时序"数据，职责清晰，不再与 KG 重叠。
// =============================================================

import { useState, useMemo } from 'react';
import type { MemoryEntry, MemoryType } from '../memory/types';

type Tab = 'chapter_summary' | 'note';

interface MemoryPanelProps {
  chapterSummaries: MemoryEntry[];
  notes:            MemoryEntry[];
  onAdd:            (e: { name: string; type: MemoryType; content: string }) => Promise<MemoryEntry> | void;
  onUpdate:         (id: string, patch: Partial<Omit<MemoryEntry, 'id' | 'updatedAt'>>) => Promise<void> | void;
  onRemove:         (id: string) => Promise<void> | void;
  onClose:          () => void;
  onOpenCharacters?: () => void;   // 跳转到角色管理
}

const TAB_CONFIG: Array<{ key: Tab; label: string; emoji: string; emptyHint: string }> = [
  {
    key: 'chapter_summary',
    label: '章节记录',
    emoji: '📖',
    emptyHint: '点击章节标题栏的「✓ 完成章节」后自动生成章节摘要。',
  },
  {
    key: 'note',
    label: '笔记',
    emoji: '📝',
    emptyHint: '点击「+ 新增」手动添加写作提醒、灵感或备忘。',
  },
];

export function MemoryPanel({
  chapterSummaries,
  notes,
  onAdd,
  onUpdate,
  onRemove,
  onClose,
  onOpenCharacters,
}: MemoryPanelProps) {
  const [tab,        setTab]       = useState<Tab>('chapter_summary');
  const [search,     setSearch]    = useState('');
  const [editingId,  setEditingId] = useState<string | 'new' | null>(null);
  const [formName,   setFormName]  = useState('');
  const [formContent, setFormContent] = useState('');
  const [expandedId, setExpandedId]  = useState<string | null>(null);

  const listMap: Record<Tab, MemoryEntry[]> = {
    chapter_summary: [...chapterSummaries].sort(
      (a, b) => (b.chapterOrder ?? b.updatedAt) - (a.chapterOrder ?? a.updatedAt),
    ),
    note: notes,
  };

  const totalCount = chapterSummaries.length + notes.length;

  const filtered = useMemo(() => {
    const list = listMap[tab];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      e => e.name.toLowerCase().includes(q) || e.content.toLowerCase().includes(q),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, chapterSummaries, notes]);

  const openNew     = () => { setFormName(''); setFormContent(''); setEditingId('new'); };
  const openEdit    = (e: MemoryEntry) => { setFormName(e.name); setFormContent(e.content); setEditingId(e.id); };
  const cancelEdit  = () => setEditingId(null);

  const commitEdit = () => {
    if (!formName.trim() || !formContent.trim()) return;
    if (editingId === 'new') {
      onAdd({ name: formName.trim(), content: formContent.trim(), type: tab });
    } else if (editingId) {
      onUpdate(editingId, { name: formName.trim(), content: formContent.trim() });
    }
    cancelEdit();
  };

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);
  const formatDate   = (ts: number) =>
    new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

  const currentTabCfg = TAB_CONFIG.find(t => t.key === tab)!;

  return (
    <div className="memory-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="memory-panel">

        {/* ── 头部 ──────────────────────────────────────────── */}
        <div className="memory-header">
          <div className="memory-header-left">
            <span className="memory-title">📚 叙事记录</span>
            <span className="memory-count">{totalCount} 条</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── 导引卡片：角色/世界数据已移至 CharacterPanel ──── */}
        {onOpenCharacters && (
          <div className="memory-guide-card" onClick={onOpenCharacters}>
            <span className="memory-guide-icon">👤</span>
            <div className="memory-guide-text">
              <div className="memory-guide-title">角色档案 &amp; 世界设定</div>
              <div className="memory-guide-sub">现由「角色管理」统一管理，数据来自知识图谱，点击前往 →</div>
            </div>
          </div>
        )}

        {/* ── Tab 导航 ──────────────────────────────────────── */}
        <div className="memory-tabs">
          {TAB_CONFIG.map(t => {
            const cnt = listMap[t.key].length;
            return (
              <button
                key={t.key}
                className={`memory-tab-btn ${tab === t.key ? 'memory-tab-active' : ''}`}
                onClick={() => { setTab(t.key); cancelEdit(); setSearch(''); }}
              >
                {t.emoji} {t.label}
                {cnt > 0 && <span className="memory-tab-count">{cnt}</span>}
              </button>
            );
          })}
        </div>

        {/* ── 搜索 + 新增 ────────────────────────────────────── */}
        <div className="memory-toolbar">
          <input
            className="memory-search"
            placeholder={`搜索${currentTabCfg.label}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {tab === 'note' && editingId === null && (
            <button className="memory-add-btn" onClick={openNew}>+ 新增</button>
          )}
        </div>

        {/* ── 编辑 / 新增表单 ────────────────────────────────── */}
        {editingId !== null && (
          <div className="memory-form">
            <input
              className="memory-form-input"
              placeholder="笔记标题"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
            />
            <textarea
              className="memory-form-textarea"
              placeholder="笔记内容…"
              rows={4}
              value={formContent}
              onChange={e => setFormContent(e.target.value)}
            />
            <div className="memory-form-actions">
              <button className="btn btn-ghost" onClick={cancelEdit}>取消</button>
              <button
                className="btn btn-primary"
                onClick={commitEdit}
                disabled={!formName.trim() || !formContent.trim()}
              >
                {editingId === 'new' ? '保存' : '更新'}
              </button>
            </div>
          </div>
        )}

        {/* ── 列表内容 ───────────────────────────────────────── */}
        <div className="memory-list">
          {filtered.length === 0 && editingId === null && (
            <div className="memory-empty">
              {search
                ? `没有找到包含「${search}」的${currentTabCfg.label}`
                : currentTabCfg.emptyHint}
            </div>
          )}

          {tab === 'chapter_summary'
            /* 章节摘要：时间线样式 */
            ? filtered.map(e => (
                <div key={e.id} className="memory-summary-item">
                  <div className="memory-summary-header">
                    <span className="memory-summary-dot" />
                    <span className="memory-summary-chapter">
                      {e.chapterOrder !== undefined ? `第 ${e.chapterOrder + 1} 章` : ''}
                    </span>
                    <span className="memory-summary-title">{e.name}</span>
                    <span className="memory-summary-date">{formatDate(e.updatedAt)}</span>
                    <button
                      className="memory-action-btn memory-action-delete"
                      onClick={() => onRemove(e.id)}
                      title="删除">✕</button>
                  </div>
                  <div className="memory-summary-content">{e.content}</div>
                </div>
              ))
            /* 笔记：可展开卡片 */
            : filtered.map(e => {
                const isExpanded = expandedId === e.id;
                const isEditing  = editingId === e.id;
                return (
                  <div key={e.id} className={`memory-card ${isExpanded ? 'memory-card-expanded' : ''}`}>
                    <div
                      className="memory-card-header"
                      onClick={() => !isEditing && toggleExpand(e.id)}
                    >
                      <div className="memory-card-left">
                        {e.autoExtracted && (
                          <span className="memory-auto-badge" title="AI 自动提取">🤖</span>
                        )}
                        <span className="memory-card-name">{e.name}</span>
                      </div>
                      <div className="memory-card-right">
                        <span className="memory-card-date">{formatDate(e.updatedAt)}</span>
                        <button className="memory-action-btn"
                          onClick={ev => { ev.stopPropagation(); openEdit(e); }} title="编辑">✎</button>
                        <button className="memory-action-btn memory-action-delete"
                          onClick={ev => { ev.stopPropagation(); onRemove(e.id); }} title="删除">✕</button>
                        <span className="memory-card-chevron">{isExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>
                    {isExpanded && !isEditing && (
                      <div className="memory-card-content">{e.content}</div>
                    )}
                    {isEditing && (
                      <div className="memory-card-edit">
                        <input className="memory-form-input" value={formName}
                          onChange={e => setFormName(e.target.value)} autoFocus />
                        <textarea className="memory-form-textarea" rows={3} value={formContent}
                          onChange={e => setFormContent(e.target.value)} />
                        <div className="memory-form-actions">
                          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={cancelEdit}>取消</button>
                          <button className="btn btn-primary" style={{ fontSize: 12 }}
                            onClick={commitEdit} disabled={!formName.trim() || !formContent.trim()}>
                            更新
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
          }
        </div>

      </div>
    </div>
  );
}

export default MemoryPanel;
