// =============================================================
// components/OutlinePanel.tsx — 大纲规划板（列表 + 画布 双视图）
// =============================================================

import { useState } from 'react';
import type { OutlineCard, CanvasNodePosition } from '../hooks/useOutline';
import type { AppSettings } from '../types';
import { OutlineCanvas } from './OutlineCanvas';
import { expandOutlineSynopsis } from '../api/gemini';

interface OutlinePanelProps {
  cards: OutlineCard[];
  bookTitle: string;
  bookSynopsis: string;
  isGenerating: boolean;
  canvasPositions: CanvasNodePosition[];
  settings: AppSettings;
  onAdd: (card: Omit<OutlineCard, 'id' | 'order'>) => void;
  onUpdate: (id: string, patch: Partial<Omit<OutlineCard, 'id'>>) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onGenerate: () => void;
  onNodeMove: (id: string, x: number, y: number) => void;
  onClose: () => void;
}

const STATUS_META: Record<OutlineCard['status'], { label: string; color: string }> = {
  planned: { label: '计划中', color: 'var(--purple-400)' },
  writing: { label: '写作中', color: 'var(--gold-400)' },
  done:    { label: '已完成', color: 'var(--success)' },
};

function AddCardForm({ onAdd }: { onAdd: OutlinePanelProps['onAdd'] }) {
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [open, setOpen] = useState(false);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), synopsis: synopsis.trim(), status: 'planned', parentId: null });
    setTitle('');
    setSynopsis('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="chapter-add-btn" style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>
        + 手动添加卡片
      </button>
    );
  }

  return (
    <div className="outline-card-edit" style={{ marginBottom: 12 }}>
      <input
        className="outline-edit-title"
        placeholder="章节名称…"
        value={title}
        autoFocus
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        maxLength={60}
      />
      <textarea
        className="outline-edit-synopsis"
        placeholder="章节梗概（可选）"
        value={synopsis}
        onChange={e => setSynopsis(e.target.value)}
        maxLength={200}
        rows={2}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={!title.trim()}>
          + 添加
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>取消</button>
      </div>
    </div>
  );
}

export function OutlinePanel({
  cards,
  bookTitle,
  bookSynopsis,
  isGenerating,
  canvasPositions,
  settings,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  onGenerate,
  onNodeMove,
  onClose,
}: OutlinePanelProps) {
  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('list');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const sorted = [...cards].sort((a, b) => a.order - b.order);

  async function handleExpandSynopsis(card: OutlineCard) {
    if (!settings.apiKey) return;
    setExpandingId(card.id);
    try {
      const synopsis = await expandOutlineSynopsis(card.title, card.synopsis, settings);
      if (synopsis) onUpdate(card.id, { synopsis });
    } catch {
      // silently ignore
    } finally {
      setExpandingId(null);
    }
  }

  // 画布模式下扩大面板宽度
  const panelStyle = viewMode === 'canvas'
    ? { width: 'min(1100px, 96vw)', height: '88vh', display: 'flex', flexDirection: 'column' as const }
    : {};

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel outline-panel" style={panelStyle}>
        <div className="modal-header">
          <span className="modal-title">📋 大纲规划</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 视图切换 */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', padding: 3 }}>
              <button
                className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setViewMode('list')}
                title="列表视图"
              >
                ☰ 列表
              </button>
              <button
                className={`btn btn-sm ${viewMode === 'canvas' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setViewMode('canvas')}
                title="思维导图画布"
              >
                🗺 画布
              </button>
            </div>

            {bookSynopsis && viewMode === 'list' && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={onGenerate}
                disabled={isGenerating}
                title="根据简介 AI 生成大纲"
              >
                {isGenerating
                  ? <><span className="btn-spinner" />生成中…</>
                  : '✨ AI 生成'}
              </button>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── 列表视图 ── */}
        {viewMode === 'list' && (
          <div className="outline-body">
            <AddCardForm onAdd={onAdd} />

            {sorted.length === 0 ? (
              <div className="snapshot-empty">
                <span className="snapshot-empty-icon">📋</span>
                <span>暂无大纲卡片。手动添加或点击「AI 生成」根据简介自动规划。</span>
              </div>
            ) : (
              <div className="outline-cards">
                {sorted.map((card, idx) => (
                  <div
                    key={card.id}
                    className={`outline-card ${dragOverIdx === idx ? 'outline-card-drag-over' : ''}`}
                    draggable
                    onDragStart={() => setDraggingIdx(idx)}
                    onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDrop={() => {
                      if (draggingIdx !== null && draggingIdx !== idx) onReorder(draggingIdx, idx);
                      setDraggingIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => { setDraggingIdx(null); setDragOverIdx(null); }}
                  >
                    <div className="outline-card-header">
                      <span className="outline-card-num">#{idx + 1}</span>
                      <span className="outline-card-title">{card.title}</span>
                      {card.parentId && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>子节点</span>
                      )}
                      <button
                        className="outline-status-badge"
                        style={{ color: STATUS_META[card.status].color }}
                        onClick={() => {
                          const next: OutlineCard['status'][] = ['planned', 'writing', 'done'];
                          const i = next.indexOf(card.status);
                          onUpdate(card.id, { status: next[(i + 1) % next.length] });
                        }}
                        title="点击切换状态"
                      >
                        {STATUS_META[card.status].label}
                      </button>
                    </div>
                    {card.synopsis && (
                      <div className="outline-card-synopsis">{card.synopsis}</div>
                    )}
                    <div className="outline-card-actions">
                      {settings.apiKey && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--purple-400)', fontSize: 12 }}
                          disabled={expandingId === card.id}
                          onClick={() => handleExpandSynopsis(card)}
                          title="AI 生成/扩写梗概"
                        >
                          {expandingId === card.id ? <><span className="btn-spinner" />扩写中…</> : '✨ 扩写'}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--text-muted)', fontSize: 12 }}
                        onClick={() => { if (window.confirm('删除此大纲卡片？')) onDelete(card.id); }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 画布视图 ── */}
        {viewMode === 'canvas' && (
          <OutlineCanvas
            cards={cards}
            bookTitle={bookTitle}
            positions={canvasPositions}
            onUpdateCard={onUpdate}
            onAddCard={onAdd}
            onDeleteCard={onDelete}
            onNodeMove={onNodeMove}
          />
        )}
      </div>
    </div>
  );
}

export default OutlinePanel;
