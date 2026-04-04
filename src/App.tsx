// =============================================================
// App.tsx — 根组件（书目 + 章节侧边栏）
// =============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Editor } from './components/Editor';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { InstructionBar } from './components/InstructionBar';
import { CommandBar } from './components/CommandBar';
import { MemoryPanel } from './components/MemoryPanel';
import { FindReplace } from './components/FindReplace';
import { CreateBookModal } from './components/CreateBookModal';
import { useMemory } from './hooks/useMemory';
import { useStorage } from './hooks/useStorage';
import { useEditor } from './hooks/useEditor';
import { useBooks } from './hooks/useBooks';
import type { Draft } from './hooks/useBooks';
import { DEFAULT_SETTINGS } from './types';
import type { AppSettings } from './types';
import { getCacheStats } from './api/cache';
import { migrateFromLocalStorage } from './db/index';
import './App.css';

const PREV_CHAPTER_TAIL_CHARS = 400;

function App() {
  const [rawSettings, setSettings] = useStorage<AppSettings>('novel-ai-settings', DEFAULT_SETTINGS);
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...rawSettings };
  const [showSettings, setShowSettings]   = useState(false);
  const [savedAt, setSavedAt]             = useState<number | null>(null);
  const [focusMode, setFocusMode]         = useState(false);
  const [showInstruction, setShowInstruction] = useState(false);
  const [showMemory, setShowMemory]       = useState(false);
  const [findMode, setFindMode]           = useState<'find' | 'replace' | null>(null);
  const [findFocusRange, setFindFocusRange] = useState<{ start: number; end: number } | null>(null);
  const [showCreateBook, setShowCreateBook] = useState(false);
  const [editingChapterTitle, setEditingChapterTitle] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState('');

  const {
    entries: memoryEntries,
    loaded: memoriesLoaded,
    add: addMemory,
    update: updateMemory,
    remove: removeMemory,
    memoryContext,
    buildContextForQuery,
  } = useMemory();

  const {
    books,
    chapters,
    activeBook,
    activeDraft,
    activeBookId,
    activeDraftId,
    loaded: booksLoaded,
    bookChapters,
    createBook,
    updateBookMeta,
    deleteBook,
    switchBook,
    selectDraft,
    createChapter,
    deleteChapter,
    updateChapterTitle,
    updateContent,
    updateContextState,
    reorderChapters,
    flushAll,
  } = useBooks();

  // 首次加载：从 localStorage 迁移数据到 IndexedDB
  useEffect(() => {
    migrateFromLocalStorage().catch(() => {});
  }, []);

  // 当书目加载完且没有任何书时，弹出创建弹窗
  useEffect(() => {
    if (booksLoaded && memoriesLoaded && books.length === 0) {
      setShowCreateBook(true);
    }
  }, [booksLoaded, memoriesLoaded, books.length]);

  // 前一章节尾段（跨章节上下文）
  const prevChapterTail = (() => {
    if (!settings.usePrevChapterContext) return '';
    const chs = bookChapters(activeBookId);
    const idx = chs.findIndex(c => c.id === activeDraftId);
    if (idx <= 0) return '';
    return chs[idx - 1].content.slice(-PREV_CHAPTER_TAIL_CHARS);
  })();

  // 编辑器 Hook
  const {
    state,
    setContent,
    setSelectionRange,
    continueWriting,
    acceptContinuation,
    rejectContinuation,
    polish,
    acceptPolish,
    rejectPolish,
    clear,
    undoClear,
  } = useEditor(
    settings,
    activeDraft?.content ?? '',
    memoryContext,
    buildContextForQuery,
    activeDraft?.contextState,
    (next) => { if (activeDraftId) updateContextState(activeDraftId, next); },
    prevChapterTail,
  );

  // beforeunload：强制刷写未保存内容
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeDraftIdRef = useRef(activeDraftId);
  activeDraftIdRef.current = activeDraftId;

  useEffect(() => {
    const handler = () => {
      const currentChapters = chaptersRef.current.map(c =>
        c.id === activeDraftIdRef.current
          ? { ...c, content: stateRef.current.content, updatedAt: Date.now() }
          : c
      );
      flushAll(currentChapters).catch(() => {});
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushAll]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const timer = window.setInterval(() => {
      const stats = getCacheStats();
      console.debug('[cache stats]', {
        reads: stats.totalReads,
        hitRate: Number((stats.hitRate * 100).toFixed(2)),
        l1Hits: stats.l1Hits,
        l2Hits: stats.l2Hits,
        misses: stats.misses,
        writes: stats.writes,
      });
    }, 12000);
    return () => window.clearInterval(timer);
  }, []);

  // 当激活章节变化时，同步编辑器内容 + 重置标题编辑状态
  useEffect(() => {
    if (activeDraft) setContent(activeDraft.content);
    setEditingChapterTitle(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDraftId]);

  // 内容变化时同步到章节（500ms 防抖）
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeDraftId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateContent(activeDraftId, state.content);
        if (settings.autoSave) setSavedAt(Date.now());
      }, 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.content]);

  // 全局键盘：Ctrl+F 查找，Ctrl+H 替换
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        e.preventDefault();
        setFindMode(prev => prev === 'find' ? null : 'find');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setFindMode(prev => prev === 'replace' ? null : 'replace');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleClear = useCallback(() => {
    if (window.confirm('确认清空全部内容？5 秒内可撤销。')) clear();
  }, [clear]);

  // 供 Toolbar 使用的全书章节（当前书）
  const allDraftsForExport: Draft[] = bookChapters(activeBookId);

  const isLoading = !booksLoaded || !memoriesLoaded;

  return (
    <div className={`app ${focusMode ? 'app-focus' : ''}`}>
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      {isLoading && (
        <div className="db-loading-overlay">
          <div className="db-loading-spinner" />
          <span className="db-loading-text">正在加载本地数据库…</span>
        </div>
      )}

      {focusMode && (
        <button className="floating-exit-focus" onClick={() => setFocusMode(false)} title="退出聚焦模式 (Esc)">
          ↗ 退出聚焦
        </button>
      )}

      <Toolbar
        isProcessing={state.isStreaming || state.isPolishing}
        hasContent={state.content.trim().length > 0}
        content={state.content}
        allDrafts={allDraftsForExport}
        canUndo={state.canUndo}
        currentStyle={settings.style}
        showInstruction={showInstruction}
        hasInstruction={!!settings.customPrompt.trim()}
        memoryCount={memoryEntries.length}
        onShowMemory={() => setShowMemory(true)}
        onClear={handleClear}
        onUndo={undoClear}
        onOpenSettings={() => setShowSettings(true)}
        onStyleChange={(style) => setSettings({ ...settings, style })}
        onToggleFocus={() => setFocusMode(true)}
        onToggleInstruction={() => setShowInstruction(v => !v)}
      />

      {showInstruction && (
        <InstructionBar
          value={settings.customPrompt}
          onChange={v => setSettings({ ...settings, customPrompt: v })}
        />
      )}

      <div className="app-body">
        <Sidebar
          books={books}
          chapters={chapters}
          activeBookId={activeBookId}
          activeDraftId={activeDraftId}
          onSelectBook={switchBook}
          onSelectChapter={selectDraft}
          onCreateBook={() => setShowCreateBook(true)}
          onCreateChapter={createChapter}
          onDeleteBook={deleteBook}
          onDeleteChapter={deleteChapter}
          onRenameChapter={updateChapterTitle}
          onRenameBook={(id, title) => updateBookMeta(id, { title })}
          onReorderChapter={reorderChapters}
        />

        <main className="main-content">
          {activeBook && (
            <div className="book-context-bar">
              <span className="book-context-title">📖 {activeBook.title}</span>
              {activeBook.synopsis && (
                <span className="book-context-synopsis">{activeBook.synopsis}</span>
              )}
            </div>
          )}
          <div className="editor-card">
            {/* 章节标题栏 */}
            {activeDraft && (
              <div className="chapter-title-bar">
                {editingChapterTitle ? (
                  <input
                    className="chapter-title-input"
                    value={chapterTitleDraft}
                    autoFocus
                    onChange={e => setChapterTitleDraft(e.target.value)}
                    onBlur={() => {
                      const t = chapterTitleDraft.trim();
                      if (t) updateChapterTitle(activeDraftId, t);
                      setEditingChapterTitle(false);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const t = chapterTitleDraft.trim();
                        if (t) updateChapterTitle(activeDraftId, t);
                        setEditingChapterTitle(false);
                      }
                      if (e.key === 'Escape') setEditingChapterTitle(false);
                    }}
                    maxLength={60}
                    placeholder="章节名…"
                  />
                ) : (
                  <button
                    className="chapter-title-display"
                    onClick={() => {
                      setChapterTitleDraft(activeDraft.title);
                      setEditingChapterTitle(true);
                    }}
                    title="点击修改章节名"
                  >
                    {activeDraft.title}
                    <span className="chapter-title-edit-hint">✎</span>
                  </button>
                )}
              </div>
            )}
            <CommandBar
              disabled={state.isStreaming || state.isPolishing || state.hasPendingContinuation || state.pendingPolish !== null}
              isStreaming={state.isStreaming}
              isPolishing={state.isPolishing}
              onContinue={continueWriting}
              onPolish={polish}
            />
            {findMode && (
              <FindReplace
                content={state.content}
                mode={findMode}
                onClose={() => { setFindMode(null); setFindFocusRange(null); }}
                onChange={setContent}
                onMatchFocus={(start, end) => setFindFocusRange({ start, end })}
              />
            )}
            <Editor
              content={state.content}
              isStreaming={state.isStreaming}
              isPolishing={state.isPolishing}
              aiInsertRange={state.aiInsertRange}
              pendingContinuation={state.pendingContinuation}
              hasPendingContinuation={state.hasPendingContinuation}
              pendingPolish={state.pendingPolish}
              focusRange={findFocusRange}
              onChange={setContent}
              onContinue={continueWriting}
              onAcceptContinuation={acceptContinuation}
              onRejectContinuation={rejectContinuation}
              onAcceptPolish={acceptPolish}
              onRejectPolish={rejectPolish}
              onSelectionChange={setSelectionRange}
            />
          </div>
        </main>
      </div>

      <StatusBar
        content={state.content}
        isStreaming={state.isStreaming}
        isPolishing={state.isPolishing}
        error={state.error}
        savedAt={savedAt}
        wordGoal={settings.wordGoal ?? 0}
        compactionCount={activeDraft?.contextState.compactionCount ?? 0}
        compactDisabled={activeDraft?.contextState.compactDisabled ?? false}
      />

      {showMemory && (
        <MemoryPanel
          entries={memoryEntries}
          onAdd={addMemory}
          onUpdate={updateMemory}
          onRemove={removeMemory}
          onClose={() => setShowMemory(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(newSettings: AppSettings) => setSettings(newSettings)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCreateBook && (
        <CreateBookModal
          isFirst={books.length === 0}
          onConfirm={async (title, synopsis) => {
            await createBook(title, synopsis);
            setShowCreateBook(false);
          }}
          onCancel={() => setShowCreateBook(false)}
        />
      )}
    </div>
  );
}

export default App;
