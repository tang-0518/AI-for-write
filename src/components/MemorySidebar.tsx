// =============================================================
// components/MemorySidebar.tsx — 右侧记忆侧边栏（可收起）
//
// 【展开布局顺序】
//   ① AI 上下文
//   ② 角色管理（快捷按钮 → 子视图）
//   ③ 指令（开关按钮，在知识图谱上方）
//   ④ 知识图谱（2D 内嵌）
//   ⑤ 章节记录
//   ⑥ 笔记
//   ⑦ 伏笔（内嵌，笔记下方）
// =============================================================

import { useState } from 'react';
import type { ContextBundle } from '../api/memoryService';
import type { MemoryEntry } from '../memory/types';
import { ContextInspector } from './ContextInspector';
import { MiniGraph } from './MiniGraph';

type SideView = 'home' | 'chars';

interface MemorySidebarProps {
  bookId?:              string | null;
  contextBundle:        ContextBundle | null;
  chapterSummaries:     MemoryEntry[];
  notes:                MemoryEntry[];
  onAddNote:            (name: string, content: string) => void;
  onRemoveEntry:        (id: string) => void;
  onOpenFullMemory:     () => void;
  onGraphNodeClick?:    (name: string, type: string) => void;
  // 内嵌子视图：角色管理
  charPanel?:           (onBack: () => void) => React.ReactNode;
  // 内嵌常驻区块：伏笔
  hooksPanel?:          (onBack: () => void) => React.ReactNode;
  // 指令开关
  onToggleInstruction?: () => void;
  hasInstruction?:      boolean;
  plotHooksUrgent?:     number;
  // 文风学习（外部弹窗，保留入口）
  onOpenStyleLearning?: () => void;
}

// ── 折叠图标条项目 ────────────────────────────────────────────
function CollapseIcon({
  emoji, label, onClick,
}: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button className="msb-col-icon" onClick={onClick} title={label}>
      <span>{emoji}</span>
    </button>
  );
}

// ── 可折叠区块 ────────────────────────────────────────────────
function SideSection({
  title, emoji, count, defaultOpen = true, children,
}: {
  title: string; emoji: string; count?: number;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="msb-section">
      <button className="msb-section-header" onClick={() => setOpen(o => !o)}>
        <span className="msb-section-emoji">{emoji}</span>
        <span className="msb-section-title">{title}</span>
        {count != null && count > 0 && (
          <span className="msb-section-count">{count}</span>
        )}
        <span className="msb-section-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="msb-section-body">{children}</div>}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────
export function MemorySidebar({
  bookId,
  contextBundle,
  chapterSummaries,
  notes,
  onAddNote,
  onRemoveEntry,
  onOpenFullMemory,
  onGraphNodeClick,
  charPanel,
  hooksPanel,
  onToggleInstruction,
  hasInstruction,
  plotHooksUrgent = 0,
}: MemorySidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [sideView, setSideView]   = useState<SideView>('home');
  const [addingNote, setAddingNote] = useState(false);
  const [noteName,   setNoteName]   = useState('');
  const [noteBody,   setNoteBody]   = useState('');

  const sortedSummaries = [...chapterSummaries]
    .sort((a, b) => (b.chapterOrder ?? b.updatedAt) - (a.chapterOrder ?? a.updatedAt))
    .slice(0, 6);

  const handleAddNote = () => {
    if (!noteName.trim() || !noteBody.trim()) return;
    onAddNote(noteName.trim(), noteBody.trim());
    setNoteName(''); setNoteBody(''); setAddingNote(false);
  };

  const goBack = () => setSideView('home');

  // ── 折叠状态 ──────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside className="msb-root msb-collapsed">
        <button className="msb-toggle-btn" onClick={() => setCollapsed(false)} title="展开侧边栏">‹</button>
        <div className="msb-col-icons">
          <CollapseIcon emoji="🧠" label="AI 上下文" onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="👤" label="角色管理"  onClick={() => { setCollapsed(false); setSideView('chars'); }} />
          <CollapseIcon emoji="🕸" label="知识图谱"  onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="📖" label="章节记录"  onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="📝" label="笔记"      onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="🎣" label="伏笔"      onClick={() => setCollapsed(false)} />
        </div>
      </aside>
    );
  }

  // ── 子视图：角色管理 ─────────────────────────────────────
  if (sideView === 'chars') {
    return (
      <aside className="msb-root msb-expanded">
        <div className="msb-subview-header">
          <button className="msb-back-btn" onClick={goBack}>← 返回</button>
          <span className="msb-subview-title">👤 角色管理</span>
        </div>
        <div className="msb-subview-body">
          {charPanel ? charPanel(goBack) : <div className="msb-empty">角色管理未配置</div>}
        </div>
      </aside>
    );
  }

  // ── 主视图 ────────────────────────────────────────────────
  return (
    <aside className="msb-root msb-expanded">

      {/* 标题栏 */}
      <div className="msb-header">
        <span className="msb-title">记忆</span>
        <div className="msb-header-actions">
          <button className="msb-action-btn" onClick={onOpenFullMemory} title="打开完整记录管理">⊞</button>
          <button className="msb-toggle-btn msb-toggle-inline" onClick={() => setCollapsed(true)} title="收起">›</button>
        </div>
      </div>

      <div className="msb-body">

        {/* ① AI 上下文 */}
        <SideSection title="AI 上下文" emoji="🧠" defaultOpen>
          <ContextInspector bundle={contextBundle} compact={false} />
        </SideSection>

        {/* ② 角色管理（快捷按钮） */}
        {charPanel && (
          <div className="msb-shortcuts">
            <button className="msb-shortcut-btn msb-shortcut-wide" onClick={() => setSideView('chars')}>
              <span>👤</span> 角色管理
            </button>
          </div>
        )}

        {/* ③ 指令（在知识图谱上方） */}
        {onToggleInstruction && (
          <button
            className={`msb-instruction-toggle ${hasInstruction ? 'msb-instruction-active' : ''}`}
            onClick={onToggleInstruction}
          >
            <span>💡</span>
            <span>写作指令{hasInstruction ? ' ●' : ''}</span>
          </button>
        )}

        {/* ④ 知识图谱 */}
        <SideSection title="知识图谱" emoji="🕸" defaultOpen>
          <MiniGraph
            bookId={bookId ?? null}
            height={260}
            onNodeClick={(name, type) => {
              if (type === 'character' && charPanel) setSideView('chars');
              onGraphNodeClick?.(name, type);
            }}
          />
        </SideSection>

        {/* ⑤ 章节记录 */}
        <SideSection
          title="章节记录"
          emoji="📖"
          count={chapterSummaries.length}
          defaultOpen={chapterSummaries.length > 0}
        >
          {sortedSummaries.length === 0 ? (
            <div className="msb-empty">完成章节后自动生成摘要</div>
          ) : (
            <div className="msb-summary-list">
              {sortedSummaries.map(e => (
                <div key={e.id} className="msb-summary-item">
                  <div className="msb-summary-header">
                    <span className="msb-summary-num">
                      {e.chapterOrder != null ? `第${e.chapterOrder + 1}章` : ''}
                    </span>
                    <span className="msb-summary-title">{e.name}</span>
                    <button className="msb-del-btn" onClick={() => onRemoveEntry(e.id)} title="删除">×</button>
                  </div>
                  <div className="msb-summary-content">{e.content}</div>
                </div>
              ))}
              {chapterSummaries.length > 6 && (
                <button className="msb-more-btn" onClick={onOpenFullMemory}>
                  还有 {chapterSummaries.length - 6} 章 →
                </button>
              )}
            </div>
          )}
        </SideSection>

        {/* ⑥ 笔记 */}
        <SideSection title="笔记" emoji="📝" count={notes.length} defaultOpen={false}>
          {notes.length === 0 && !addingNote ? (
            <div className="msb-empty">还没有笔记</div>
          ) : (
            <div className="msb-note-list">
              {notes.map(e => (
                <div key={e.id} className="msb-note-item">
                  <div className="msb-note-name">{e.name}</div>
                  <div className="msb-note-content">{e.content}</div>
                  <button className="msb-del-btn msb-note-del" onClick={() => onRemoveEntry(e.id)} title="删除">×</button>
                </div>
              ))}
            </div>
          )}
          {addingNote ? (
            <div className="msb-note-form">
              <input
                className="msb-note-input"
                placeholder="笔记标题"
                value={noteName}
                onChange={e => setNoteName(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Escape') { setAddingNote(false); setNoteName(''); setNoteBody(''); } }}
              />
              <textarea
                className="msb-note-input msb-note-textarea"
                placeholder="笔记内容…"
                value={noteBody}
                onChange={e => setNoteBody(e.target.value)}
                rows={3}
              />
              <div className="msb-note-form-actions">
                <button className="btn btn-ghost" style={{ fontSize: 11 }}
                  onClick={() => { setAddingNote(false); setNoteName(''); setNoteBody(''); }}>取消</button>
                <button className="btn btn-primary" style={{ fontSize: 11 }}
                  onClick={handleAddNote}
                  disabled={!noteName.trim() || !noteBody.trim()}>保存</button>
              </div>
            </div>
          ) : (
            <button className="msb-add-note-btn" onClick={() => setAddingNote(true)}>+ 添加笔记</button>
          )}
        </SideSection>

        {/* ⑦ 伏笔（笔记下方，内嵌常驻） */}
        {hooksPanel && (
          <SideSection
            title="伏笔"
            emoji="🎣"
            count={plotHooksUrgent > 0 ? plotHooksUrgent : undefined}
            defaultOpen={false}
          >
            <div className="msb-hooks-inline">
              {hooksPanel(() => {})}
            </div>
          </SideSection>
        )}

      </div>
    </aside>
  );
}

export default MemorySidebar;
