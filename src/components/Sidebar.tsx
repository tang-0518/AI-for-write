// =============================================================
// components/Sidebar.tsx — 书目 + 章节树形侧边栏
// 使用 .tree-* 类名，匹配 App.css 中已定义的树形样式
// =============================================================

import { useState, useRef } from 'react';
import type { Book } from '../types';
import type { Draft } from '../hooks/useBooks';

interface SidebarProps {
  books: Book[];
  chapters: Draft[];
  activeBookId: string;
  activeDraftId: string;
  completedChapterIds?: Set<string>;
  onSelectBook: (bookId: string) => void;
  onSelectChapter: (id: string) => void;
  onCreateBook: () => void;
  onCreateChapter: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onDeleteChapter: (id: string) => void;
  onRenameChapter: (id: string, title: string) => void;
  onRenameBook: (id: string, title: string) => void;
  onReorderChapter: (bookId: string, fromIndex: number, toIndex: number) => void;
  onOpenOutline?: () => void;
}

function countChinese(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

export function Sidebar({
  books,
  chapters,
  activeBookId,
  activeDraftId,
  completedChapterIds,
  onSelectBook,
  onSelectChapter,
  onCreateBook,
  onCreateChapter,
  onDeleteBook,
  onDeleteChapter,
  onRenameChapter,
  onRenameBook,
  onReorderChapter,
  onOpenOutline,
}: SidebarProps) {
  const [collapsed, setCollapsed]       = useState(false);
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingType, setEditingType]   = useState<'book' | 'chapter'>('chapter');
  const [dragOverId, setDragOverId]     = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // 判断某本书是否展开（默认：当前激活的书展开）
  const isBookExpanded = (bookId: string) => {
    if (expandedBooks.has(bookId)) return true;
    return bookId === activeBookId && !expandedBooks.has(`__collapsed__${bookId}`);
  };

  const toggleBook = (bookId: string, isActive: boolean) => {
    setExpandedBooks(prev => {
      const next = new Set(prev);
      const colKey = `__collapsed__${bookId}`;
      if (isActive) {
        // 激活的书：切换折叠标记
        if (next.has(colKey)) {
          next.delete(colKey);
        } else {
          next.add(colKey);
        }
      } else {
        // 非激活书：切换手动展开状态
        if (next.has(bookId)) {
          next.delete(bookId);
        } else {
          next.add(bookId);
        }
      }
      return next;
    });
  };

  // ── 编辑 ─────────────────────────────────────────────────
  const startEdit = (id: string, title: string, type: 'book' | 'chapter') => {
    setEditingId(id);
    setEditingTitle(title);
    setEditingType(type);
  };

  const commitEdit = (id: string) => {
    const t = editingTitle.trim();
    if (t) {
      if (editingType === 'book') onRenameBook(id, t);
      else onRenameChapter(id, t);
    }
    setEditingId(null);
  };

  // ── 拖拽排序 ──────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).classList.add('tree-dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    dragIdRef.current = null;
    setDragOverId(null);
    (e.currentTarget as HTMLElement).classList.remove('tree-dragging');
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string, bookId: string) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    if (!fromId || fromId === targetId) { setDragOverId(null); return; }
    const bookChs = chapters
      .filter(c => c.bookId === bookId)
      .sort((a, b) => a.order - b.order);
    const fromIndex = bookChs.findIndex(c => c.id === fromId);
    const toIndex   = bookChs.findIndex(c => c.id === targetId);
    if (fromIndex !== -1 && toIndex !== -1) onReorderChapter(bookId, fromIndex, toIndex);
    setDragOverId(null);
  };

  // ── 派生数据 ──────────────────────────────────────────────
  const bookChapters = (bookId: string) =>
    chapters.filter(c => c.bookId === bookId).sort((a, b) => a.order - b.order);

  const totalWords = chapters.reduce((s, c) => s + countChinese(c.content), 0);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {/* 折叠按钮 */}
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed(v => !v)}
        title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
      >
        {collapsed ? '❯' : '❮'}
      </button>

      {!collapsed && (
        <>
          {/* 顶部：标题 + 新建书目 */}
          <div className="sidebar-header">
            <span className="sidebar-title">📚 书架</span>
            <button className="sidebar-create" onClick={onCreateBook} title="新建书目">+</button>
          </div>

          {/* 全部汉字统计 */}
          {totalWords > 0 && (
            <div className="sidebar-total">
              全部 <span className="sidebar-total-num">{totalWords.toLocaleString()}</span> 汉字
            </div>
          )}

          {/* 树形书目列表 */}
          <div className="sidebar-tree">
            {books.map(book => {
              const isActiveBook = book.id === activeBookId;
              const chs = bookChapters(book.id);
              const wc  = chs.reduce((s, c) => s + countChinese(c.content), 0);

              const isExpanded = isBookExpanded(book.id);

              return (
                <div key={book.id} className={`tree-book ${isActiveBook ? 'tree-book-active' : ''}`}>
                  {/* 书名行 */}
                  <div
                    className="tree-book-row"
                    onClick={() => {
                      if (isActiveBook) {
                        toggleBook(book.id, true);
                      } else {
                        onSelectBook(book.id);
                        // 切换到新书时默认展开
                        setExpandedBooks(prev => {
                          const next = new Set(prev);
                          next.delete(`__collapsed__${book.id}`);
                          return next;
                        });
                      }
                    }}
                  >
                    {/* 展开/折叠箭头 */}
                    <span className="tree-chevron" style={{ fontSize: 10 }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>

                    {/* 文件夹图标 */}
                    <span className="tree-icon">
                      <span className="tree-icon-folder" style={{ fontSize: 14 }}>
                        {isActiveBook ? '📂' : '📁'}
                      </span>
                    </span>

                    {/* 书名（可编辑） */}
                    {editingId === book.id ? (
                      <input
                        className="tree-edit-input"
                        value={editingTitle}
                        autoFocus
                        onChange={e => setEditingTitle(e.target.value)}
                        onBlur={() => commitEdit(book.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit(book.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="tree-label tree-book-label"
                        onDoubleClick={e => { e.stopPropagation(); startEdit(book.id, book.title, 'book'); }}
                        title={book.synopsis || book.title}
                      >
                        {book.title}
                      </span>
                    )}

                    {/* 字数 */}
                    {wc > 0 && (
                      <span className="tree-meta">{wc >= 10000 ? `${(wc / 10000).toFixed(1)}万` : `${wc}字`}</span>
                    )}

                    {/* 删除 */}
                    <button
                      className="tree-delete"
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm(`确认删除《${book.title}》及其所有章节？此操作不可撤销。`))
                          onDeleteBook(book.id);
                      }}
                      title="删除书目"
                    >×</button>
                  </div>

                  {/* 章节列表（展开时显示） */}
                  {isExpanded && (
                    <div className="tree-children">
                      {chs.map((ch, idx) => {
                        const isLast = idx === chs.length - 1;
                        const isDone = completedChapterIds?.has(ch.id);
                        const isActive = ch.id === activeDraftId;
                        const chWc = countChinese(ch.content);

                        return (
                          <div
                            key={ch.id}
                            className={[
                              'tree-chapter-row',
                              isActive  ? 'tree-row-active'    : '',
                              isDone    ? 'tree-chapter-done'  : '',
                              dragOverId === ch.id ? 'tree-drag-over' : '',
                              isLast    ? 'tree-chapter-last'  : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => onSelectChapter(ch.id)}
                            draggable
                            onDragStart={e => handleDragStart(e, ch.id)}
                            onDragEnd={handleDragEnd}
                            onDragOver={e => handleDragOver(e, ch.id)}
                            onDrop={e => handleDrop(e, ch.id, book.id)}
                          >
                            {/* 拖拽把手 */}
                            {chs.length > 1 && (
                              <span className="tree-drag-handle" title="拖拽排序">⋮</span>
                            )}

                            {/* 文件图标 */}
                            <span className="tree-icon">
                              <span className="tree-icon-file" style={{ fontSize: 12 }}>
                                {isDone ? '✓' : '◦'}
                              </span>
                            </span>

                            {/* 章节名（可编辑） */}
                            {editingId === ch.id ? (
                              <input
                                className="tree-edit-input"
                                value={editingTitle}
                                autoFocus
                                onChange={e => setEditingTitle(e.target.value)}
                                onBlur={() => commitEdit(ch.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitEdit(ch.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="tree-label"
                                onDoubleClick={e => { e.stopPropagation(); startEdit(ch.id, ch.title, 'chapter'); }}
                                title={ch.title}
                              >
                                {ch.title}
                              </span>
                            )}

                            {/* 字数 */}
                            {chWc > 0 && (
                              <span className="tree-meta">{chWc.toLocaleString()}</span>
                            )}

                            {/* 删除（多于1章时才显示） */}
                            {chs.length > 1 && (
                              <button
                                className="tree-delete"
                                onClick={e => { e.stopPropagation(); onDeleteChapter(ch.id); }}
                                title="删除章节"
                              >×</button>
                            )}
                          </div>
                        );
                      })}

                      {/* 新增章节 */}
                      <div className="tree-add-row">
                        <button
                          className="tree-add-btn"
                          onClick={() => onCreateChapter(book.id)}
                        >
                          + 新增章节
                        </button>
                        {onOpenOutline && isActiveBook && (
                          <button
                            className="tree-outline-btn"
                            onClick={onOpenOutline}
                            title="打开大纲规划板"
                          >
                            📋 大纲
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
