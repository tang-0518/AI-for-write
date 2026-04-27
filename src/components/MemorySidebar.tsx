// =============================================================
// components/MemorySidebar.tsx - 右侧记忆侧边栏（可收起）
// =============================================================

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ContextBundle } from '../api/memoryService';
import type { MemoryEntry } from '../memory/types';
import { ContextInspector } from './ContextInspector';
import { MiniGraph } from './MiniGraph';

type SideView = 'home' | 'chars';

interface MemorySidebarProps {
  bookId?: string | null;
  contextBundle: ContextBundle | null;
  chapterSummaries: MemoryEntry[];
  notes: MemoryEntry[];
  onAddNote: (name: string, content: string) => void;
  onRemoveEntry: (id: string) => void;
  onOpenFullMemory: () => void;
  onGraphNodeClick?: (name: string, type: string) => void;
  charPanel?: (onBack: () => void) => ReactNode;
  hooksPanel?: (onBack: () => void) => ReactNode;
  onToggleInstruction?: () => void;
  hasInstruction?: boolean;
  plotHooksUrgent?: number;
  onOpenStyleLearning?: () => void;
  onOpenCapsules?: () => void;
}

function CollapseIcon({
  emoji,
  label,
  onClick,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="msb-col-icon" onClick={onClick} title={label}>
      <span>{emoji}</span>
    </button>
  );
}

function SideSection({
  title,
  emoji,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  emoji: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="msb-section">
      <button className="msb-section-header" onClick={() => setOpen(value => !value)}>
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
  onOpenStyleLearning,
  onOpenCapsules,
}: MemorySidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [sideView, setSideView] = useState<SideView>('home');
  const [addingNote, setAddingNote] = useState(false);
  const [noteName, setNoteName] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const sortedSummaries = [...chapterSummaries]
    .sort((a, b) => (b.chapterOrder ?? b.updatedAt) - (a.chapterOrder ?? a.updatedAt))
    .slice(0, 6);

  const handleAddNote = () => {
    if (!noteName.trim() || !noteBody.trim()) return;
    onAddNote(noteName.trim(), noteBody.trim());
    setNoteName('');
    setNoteBody('');
    setAddingNote(false);
  };

  const resetNoteForm = () => {
    setAddingNote(false);
    setNoteName('');
    setNoteBody('');
  };

  const goBack = () => setSideView('home');

  if (collapsed) {
    return (
      <aside className="msb-root msb-collapsed">
        <button className="msb-toggle-btn" onClick={() => setCollapsed(false)} title="展开侧边栏">
          »
        </button>
        <div className="msb-col-icons">
          <CollapseIcon emoji="🧥" label="AI 上下文" onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="👤" label="角色管理" onClick={() => { setCollapsed(false); setSideView('chars'); }} />
          {onOpenCapsules && <CollapseIcon emoji="🧬" label="角色胶囊" onClick={onOpenCapsules} />}
          {onOpenStyleLearning && <CollapseIcon emoji="🎨" label="文风学习" onClick={onOpenStyleLearning} />}
          <CollapseIcon emoji="🕸" label="知识图谱" onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="🉉" label="章节记录" onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="📝" label="笔记" onClick={() => setCollapsed(false)} />
          <CollapseIcon emoji="🎣" label="伏笔" onClick={() => setCollapsed(false)} />
        </div>
      </aside>
    );
  }

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

  return (
    <aside className="msb-root msb-expanded">
      <div className="msb-header">
        <span className="msb-title">记忆</span>
        <div className="msb-header-actions">
          <button className="msb-action-btn" onClick={onOpenFullMemory} title="打开完整记忆管理">
            ☐
          </button>
          <button className="msb-toggle-btn msb-toggle-inline" onClick={() => setCollapsed(true)} title="收起">
            —
          </button>
        </div>
      </div>

      <div className="msb-body">
        <SideSection title="AI 上下文" emoji="🧥" defaultOpen>
          <ContextInspector bundle={contextBundle} compact={false} />
        </SideSection>

        {(charPanel || onOpenCapsules || onOpenStyleLearning) && (
          <div className="msb-shortcuts">
            {charPanel && (
              <button className="msb-shortcut-btn" onClick={() => setSideView('chars')}>
                <span>👤</span> 角色管理
              </button>
            )}
            {onOpenCapsules && (
              <button className="msb-shortcut-btn" onClick={onOpenCapsules}>
                <span>🧬</span> 角色胶囊
              </button>
            )}
            {onOpenStyleLearning && (
              <button className="msb-shortcut-btn" onClick={onOpenStyleLearning}>
                <span>🎨</span> 文风学习
              </button>
            )}
          </div>
        )}

        {onToggleInstruction && (
          <button
            className={`msb-instruction-toggle ${hasInstruction ? 'msb-instruction-active' : ''}`}
            onClick={onToggleInstruction}
          >
            <span>💡</span>
            <span>写作指令{hasInstruction ? ' ●' : ''}</span>
          </button>
        )}

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

        <SideSection
          title="章节记录"
          emoji="🉉"
          count={chapterSummaries.length}
          defaultOpen={chapterSummaries.length > 0}
        >
          {sortedSummaries.length === 0 ? (
            <div className="msb-empty">完成章节后会自动生成摘要</div>
          ) : (
            <div className="msb-summary-list">
              {sortedSummaries.map(entry => (
                <div key={entry.id} className="msb-summary-item">
                  <div className="msb-summary-header">
                    <span className="msb-summary-num">
                      {entry.chapterOrder != null ? `第${entry.chapterOrder + 1}章` : ''}
                    </span>
                    <span className="msb-summary-title">{entry.name}</span>
                    <button className="msb-del-btn" onClick={() => onRemoveEntry(entry.id)} title="删除">
                      ×
                    </button>
                  </div>
                  <div className="msb-summary-content">{entry.content}</div>
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

        <SideSection title="笔记" emoji="📝" count={notes.length} defaultOpen={false}>
          {notes.length === 0 && !addingNote ? (
            <div className="msb-empty">还没有笔记</div>
          ) : (
            <div className="msb-note-list">
              {notes.map(entry => (
                <div key={entry.id} className="msb-note-item">
                  <div className="msb-note-name">{entry.name}</div>
                  <div className="msb-note-content">{entry.content}</div>
                  <button
                    className="msb-del-btn msb-note-del"
                    onClick={() => onRemoveEntry(entry.id)}
                    title="删除"
                  >
                    ×
                  </button>
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
                onChange={event => setNoteName(event.target.value)}
                autoFocus
                onKeyDown={event => {
                  if (event.key === 'Escape') resetNoteForm();
                }}
              />
              <textarea
                className="msb-note-input msb-note-textarea"
                placeholder="笔记内容…"
                value={noteBody}
                onChange={event => setNoteBody(event.target.value)}
                rows={3}
              />
              <div className="msb-note-form-actions">
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={resetNoteForm}>
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 11 }}
                  onClick={handleAddNote}
                  disabled={!noteName.trim() || !noteBody.trim()}
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            <button className="msb-add-note-btn" onClick={() => setAddingNote(true)}>
              + 添加笔记
            </button>
          )}
        </SideSection>

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
