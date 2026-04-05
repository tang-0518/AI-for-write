// =============================================================
// components/OutlinePanel.tsx — 大纲规划板
// =============================================================

import { useState } from 'react';
import type { OutlineCard } from '../hooks/useOutline';

interface OutlinePanelProps {
  cards: OutlineCard[];
  bookSynopsis: string;
  isGenerating: boolean;
  onAdd: (card: Omit<OutlineCard, 'id' | 'order'>) => void;
  onUpdate: (id: string, patch: Partial<Omit<OutlineCard, 'id'>>) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onGenerate: () => void;
  onClose: () => void;
}

const STATUS_META: Record<OutlineCard['status'], { label: string; color: string }> = {
  planned: { label: '计划中', color: '#60a5fa' },
  writing: { label: '写作中', color: '#fbbf24' },
  done:    { label: '已完成', color: '#34d399' },
};

function AddCardForm({ onAdd }: { onAdd: OutlinePanelProps['onAdd'] }) {
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [open, setOpen] = useState(false);

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), synopsis: synopsis.trim(), status: 'planned' });
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
  bookSynopsis,
  isGenerating,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  onGenerate,
  onClose,
}: OutlinePanelProps) {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const sorted = [...cards].sort((a, b) => a.order - b.order);

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel outline-panel">
        <div className="modal-header">
          <span className="modal-title">📋 大纲规划</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {bookSynopsis && (
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
      </div>
    </div>
  );
}
