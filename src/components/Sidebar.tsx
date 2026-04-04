// =============================================================
// components/Sidebar.tsx — 书目 + 章节两级侧边栏
// =============================================================

import { useState, useRef } from 'react';
import type { Book } from '../types';
import type { Draft } from '../hooks/useBooks';

interface SidebarProps {
  books: Book[];
  chapters: Draft[];           // 全部章节（所有书）
  activeBookId: string;
  activeDraftId: string;
  onSelectBook: (bookId: string) => void;
  onSelectChapter: (id: string) => void;
  onCreateBook: () => void;
  onCreateChapter: (bookId: string) => void;
  onDeleteBook: (bookId: string) => void;
  onDeleteChapter: (id: string) => void;
  onRenameChapter: (id: string, title: string) => void;
  onRenameBook: (id: string, title: string) => void;
  onReorderChapter: (bookId: string, fromIndex: number, toIndex: number) => void;
}

function countChinese(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

export function Sidebar({
  books,
  chapters,
  activeBookId,
  activeDraftId,
  onSelectBook,
  onSelectChapter,
  onCreateBook,
  onCreateChapter,
  onDeleteBook,
  onDeleteChapter,
  onRenameChapter,
  onRenameBook,
  onReorderChapter,
}: SidebarProps) {
  const [collapsed, setCollapsed]     = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingType, setEditingType] = useState<'book' | 'chapter'>('chapter');
  const [dragOverId, setDragOverId]   = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

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

  // ── 拖拽（章节内部排序）───────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
    (e.currentTarget as HTMLElement).classList.add('draft-dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    dragIdRef.current = null;
    setDragOverId(null);
    (e.currentTarget as HTMLElement).classList.remove('draft-dragging');
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

  const bookWordCount = (bookId: string) =>
    chapters.filter(c => c.bookId === bookId).reduce((s, c) => s + countChinese(c.content), 0);

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

          {/* 书目列表 */}
          <div className="book-list">
            {books.map(book => {
              const isActiveBook = book.id === activeBookId;
              const chs = bookChapters(book.id);
              const wc  = bookWordCount(book.id);

              return (
                <div key={book.id} className={`book-group ${isActiveBook ? 'book-group-active' : ''}`}>
                  {/* 书名行 */}
                  <div
                    className="book-header"
                    onClick={() => onSelectBook(book.id)}
                  >
                    <span className="book-arrow">{isActiveBook ? '▾' : '▸'}</span>

                    {editingId === book.id ? (
                      <input
                        className="draft-title-input"
                        value={editingTitle}
                        autoFocus
                        onChange={e => setEditingTitle(e.target.value)}
                        onBlur={() => commitEdit(book.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(book.id); if (e.key === 'Escape') setEditingId(null); }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="book-title"
                        onDoubleClick={e => { e.stopPropagation(); startEdit(book.id, book.title, 'book'); }}
                        title={book.synopsis || book.title}
                      >
                        {book.title}
                      </span>
                    )}

                    {wc > 0 && (
                      <span className="book-wordcount">{wc.toLocaleString()}字</span>
                    )}

                    <button
                      className="draft-delete"
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm(`确认删除《${book.title}》及其所有章节？此操作不可撤销。`)) {
                          onDeleteBook(book.id);
                        }
                      }}
                      title="删除书目（含所有章节）"
                    >×</button>
                  </div>

                  {/* 章节列表（仅展开当前书） */}
                  {isActiveBook && (
                    <ul className="draft-list chapter-list">
                      {chs.map(ch => (
                        <li
                          key={ch.id}
                          className={`draft-item ${ch.id === activeDraftId ? 'draft-active' : ''} ${dragOverId === ch.id ? 'draft-drag-over' : ''}`}
                          onClick={() => onSelectChapter(ch.id)}
                          draggable
                          onDragStart={e => handleDragStart(e, ch.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={e => handleDragOver(e, ch.id)}
                          onDrop={e => handleDrop(e, ch.id, book.id)}
                        >
                          <span className="draft-drag-handle" title="拖拽排序">⋮⋮</span>

                          {editingId === ch.id ? (
                            <input
                              className="draft-title-input"
                              value={editingTitle}
                              autoFocus
                              onChange={e => setEditingTitle(e.target.value)}
                              onBlur={() => commitEdit(ch.id)}
                              onKeyDown={e => { if (e.key === 'Enter') commitEdit(ch.id); if (e.key === 'Escape') setEditingId(null); }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              className="draft-title"
                              onDoubleClick={e => { e.stopPropagation(); startEdit(ch.id, ch.title, 'chapter'); }}
                            >
                              {ch.title}
                            </span>
                          )}

                          <div className="draft-footer">
                            {countChinese(ch.content) > 0 && (
                              <span className="draft-wordcount">
                                {countChinese(ch.content).toLocaleString()}字
                              </span>
                            )}
                          </div>

                          {chs.length > 1 && (
                            <button
                              className="draft-delete"
                              onClick={e => { e.stopPropagation(); onDeleteChapter(ch.id); }}
                              title="删除章节"
                            >×</button>
                          )}
                        </li>
                      ))}

                      {/* 新增章节按钮 */}
                      <li className="chapter-add-row">
                        <button
                          className="chapter-add-btn"
                          onClick={() => onCreateChapter(book.id)}
                        >
                          + 新增章节
                        </button>
                      </li>
                    </ul>
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
