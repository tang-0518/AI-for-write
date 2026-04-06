// =============================================================
// App.tsx — 根组件（协调���，不含业务逻辑）
// 业务逻辑已下沉到各专用 Hook，此处仅负责组装和渲染。
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import { Toolbar }              from './components/Toolbar';
import { Editor }               from './components/Editor';
import { AiSuggestionPanel }    from './components/AiSuggestionPanel';
import { StatusBar }            from './components/StatusBar';
import { SettingsModal }        from './components/SettingsModal';
import { Sidebar }              from './components/Sidebar';
import { InstructionBar }       from './components/InstructionBar';
import { CommandBar }           from './components/CommandBar';
import { MemoryPanel }          from './components/MemoryPanel';
import { FindReplace }          from './components/FindReplace';
import { CreateBookModal }      from './components/CreateBookModal';
import { ChapterCompleteModal } from './components/ChapterCompleteModal';
import { SnapshotPanel }        from './components/SnapshotPanel';
import { VersionPickerPanel }   from './components/VersionPickerPanel';
import { ConsistencyPanel }     from './components/ConsistencyPanel';
import { CrossChapterSearch }   from './components/CrossChapterSearch';
import { OutlinePanel }         from './components/OutlinePanel';
import { SceneTemplates }       from './components/SceneTemplates';
import { StyleLearningPanel }   from './components/StyleLearningPanel';
import { ShortcutHelpPanel }    from './components/ShortcutHelpPanel';
import { StatsPanel }           from './components/StatsPanel';
import { useWritingStats }      from './hooks/useWritingStats';
import { useStorage }           from './hooks/useStorage';
import { useEditor }            from './hooks/useEditor';
import { useBooks }             from './hooks/useBooks';
import { useMemory }            from './hooks/useMemory';
import { useAutoSave }          from './hooks/useAutoSave';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useChapterComplete }   from './hooks/useChapterComplete';
import { useSnapshots }         from './hooks/useSnapshots';
import { useOutline }           from './hooks/useOutline';
import { useTheme }             from './hooks/useTheme';
import { useStyleLearning }     from './hooks/useStyleLearning';
import { useOnlineStatus }      from './hooks/useOnlineStatus';
import type { Draft }           from './hooks/useBooks';
import { checkConsistency }     from './api/gemini';
import { generateOutline }      from './api/gemini';
import type { ConsistencyIssue } from './api/gemini';
import type { OutlineCard }     from './hooks/useOutline';
import { DEFAULT_SETTINGS }     from './types';
import type { AppSettings }     from './types';
import { migrateSettings }      from './utils/settingsMigration';
import { getCacheStats }        from './api/cache';
import { extractWritingPreference } from './api/gemini';
import { migrateFromLocalStorage } from './db/index';
import { formatStyleForPrompt }    from './api/styleAnalysis';
import { PREV_CHAPTER_TAIL_CHARS } from './config/constants';
import './App.css';

// 按中文句末标点拆分长段落，保留标点在句尾
function splitBySentenceEnd(text: string): string[] {
  const result: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if ('。！？'.includes(text[i])) {
      // 右引号/右括号紧跟句末标点时一并归入本句
      const next = text[i + 1] ?? '';
      if ('」』"）)'.includes(next)) {
        current += next;
        i++;
      }
      result.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) result.push(current.trim());
  // 若拆出的句子少于2个，说明无句末标点，整段作为一个段落
  return result.length >= 2 ? result : [text];
}

function App() {
  const [rawSettings, setSettings] = useStorage<AppSettings>('novel-ai-settings', DEFAULT_SETTINGS);
  const settings: AppSettings = migrateSettings({ ...rawSettings });
  const { theme, setTheme, THEMES } = useTheme();
  const isOnline = useOnlineStatus();

  // ── UI 状态（纯视图开关，无业务逻辑） ─────────────────────
  const [showSettings, setShowSettings]       = useState(false);
  const [showInstruction, setShowInstruction] = useState(false);
  const [showMemory, setShowMemory]           = useState(false);
  const [findMode, setFindMode]               = useState<'find' | 'replace' | null>(null);
  const [findFocusRange, setFindFocusRange]   = useState<{ start: number; end: number } | null>(null);
  const [showCreateBook, setShowCreateBook]   = useState(false);
  const [editingChapterTitle, setEditingChapterTitle] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft]     = useState('');
  const [showSnapshot, setShowSnapshot]       = useState(false);
  const [showConsistency, setShowConsistency] = useState(false);
  const [showCrossSearch, setShowCrossSearch] = useState(false);
  const [showOutline, setShowOutline]         = useState(false);
  const [showSceneTemplates, setShowSceneTemplates] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp]     = useState(false);
  const [showStats, setShowStats]                   = useState(false);
  const [showStyleLearning, setShowStyleLearning]   = useState(false);
  const [consistencyIssues, setConsistencyIssues] = useState<ConsistencyIssue[] | null>(null);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [synopsisVisible, setSynopsisVisible] = useState(true);
  const [completedChapterIdsArr, setCompletedChapterIdsArr] = useStorage<string[]>('novel-completed-chapters', []);
  const completedChapterIds = new Set(completedChapterIdsArr);

  // ── 数据层 Hook ───────────────────────────────────────────
  const {
    books, chapters, activeBook, activeDraft,
    activeBookId, activeDraftId, loaded: booksLoaded,
    bookChapters, createBook, createBookWithChapters, updateBookMeta, deleteBook,
    switchBook, selectDraft, createChapter, deleteChapter,
    updateChapterTitle, updateContent, updateContextState,
    reorderChapters, flushAll,
  } = useBooks();

  const {
    entries: memoryEntries, truthFiles, loaded: memoriesLoaded,
    add: addMemory, update: updateMemory, remove: removeMemory,
    saveTruthFiles, memoryContext, buildContextForQuery,
  } = useMemory(activeBookId);

  // ── 文风学习 ─────────────────────────────────────────────
  const {
    profiles: styleProfiles,
    status: styleStatus,
    errorMsg: styleError,
    createProfile: createStyleProfile,
    deleteProfile: deleteStyleProfile,
    renameProfile: renameStyleProfile,
  } = useStyleLearning(settings);

  // 激活档案对应的 prompt 字符串（供 useEditor 注入续写）
  const activeStyleBlock = (() => {
    const prof = styleProfiles.find(p => p.id === settings.imitationProfileId);
    if (!prof || !settings.imitationMode) return '';
    return formatStyleForPrompt(prof, 'full');
  })();

  // ── 初始化 ───────────────────────────────────────────────
  useEffect(() => {
    migrateFromLocalStorage().catch(() => {});
  }, []);

  useEffect(() => {
    if (booksLoaded && memoriesLoaded && books.length === 0) setShowCreateBook(true);
  }, [booksLoaded, memoriesLoaded, books.length]);

  // ── 编辑器 ────────────────────────────────────────────────
  const prevChapterTail = (() => {
    if (!settings.usePrevChapterContext) return '';
    const chs = bookChapters(activeBookId);
    const idx = chs.findIndex(c => c.id === activeDraftId);
    if (idx <= 0) return '';
    return chs[idx - 1].content.slice(-PREV_CHAPTER_TAIL_CHARS);
  })();

  const {
    state, setContent, setSelectionRange,
    continueWriting, acceptContinuation, rejectContinuation, resumeWriting,
    polish, acceptPolish, rejectPolish,
    generateVersions, selectVersion, dismissVersions,
    clear, undoClear, insertAtCursor, resetBlocks,
  } = useEditor(
    settings,
    activeDraft?.content ?? '',
    memoryContext,
    buildContextForQuery,
    activeDraft?.contextState,
    (next) => { if (activeDraftId) updateContextState(activeDraftId, next); },
    prevChapterTail,
    activeStyleBlock,
  );

  // 章节���换时同步编辑器内容
  useEffect(() => {
    if (activeDraft) setContent(activeDraft.content);
    resetBlocks();
    setEditingChapterTitle(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDraftId]);

  // ── 业务 Hook（自动保存 / 快捷键 / 章节完成） ────────────
  const { savedAt } = useAutoSave({
    activeDraftId,
    content: state.content,
    chapters,
    settings,
    updateContent,
    flushAll,
  });

  useKeyboardShortcuts({
    onFind:         () => setFindMode(prev => prev === 'find'    ? null : 'find'),
    onReplace:      () => setFindMode(prev => prev === 'replace' ? null : 'replace'),
    onCrossSearch:  () => setShowCrossSearch(v => !v),
    onFontIncrease: () => setSettings(s => ({ ...s, editorFontSize: Math.min(26, (s.editorFontSize ?? 17) + 1) })),
    onFontDecrease: () => setSettings(s => ({ ...s, editorFontSize: Math.max(12, (s.editorFontSize ?? 17) - 1) })),
    onHelp:         () => setShowShortcutHelp(v => !v),
  });

  const { snapshots, saveSnapshot, deleteSnapshot, pinSnapshot, overLimitWarning, dismissOverLimitWarning } = useSnapshots(
    activeDraft?.id ?? '',
    activeBookId,
  );

  const outline = useOutline(activeBookId);

  const allChaptersTotalWords = bookChapters(activeBookId).reduce((s, c) => s + c.content.replace(/\s/g, '').length, 0);
  const { stats: writingStats, recordAiAccepted, recordAiRejected } = useWritingStats(allChaptersTotalWords);

  const chapterComplete = useChapterComplete({
    activeDraft,
    activeBookId,
    settings,
    saveTruthFiles,
    onSaveSnapshot: saveSnapshot,
  });

  // ── 开发调试：定期输出缓存统计 ───────────────────────────
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const timer = window.setInterval(() => {
      const s = getCacheStats();
      console.debug('[cache]', { hitRate: `${(s.hitRate * 100).toFixed(1)}%`, l1: s.l1Hits, l2: s.l2Hits, miss: s.misses });
    }, 12_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleClear = useCallback(() => {
    if (window.confirm('确认清空全部内容？5 秒内可撤销。')) clear();
  }, [clear]);

  // 一键排版：段首缩进 + 句末自动分段 + 去多余空行
  const handleFormat = useCallback(() => {
    const raw = state.content;
    if (!raw.trim()) return;

    // 按两个及以上连续换行切分段落块
    const blocks = raw.split(/\n{2,}/);
    const result: string[] = [];

    for (const block of blocks) {
      const text = block.trim();
      if (!text) continue;

      // 每个段落块内可能有多行（单换行），逐行处理后再按句末分段
      const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);

      for (const line of rawLines) {
        const charCount = line.replace(/\s/g, '').length;

        if (charCount > 60) {
          // 长段落：按中文句末标点自动拆分为多个短段
          const sentences = splitBySentenceEnd(line);
          for (const s of sentences) {
            if (s.trim()) {
              result.push('\u3000\u3000' + s.trim());
              result.push('');    // 段落间空行
            }
          }
        } else {
          // 短段落直接加首行缩进
          result.push('\u3000\u3000' + line);
          result.push('');
        }
      }
    }

    // 去掉末尾多余空行
    while (result.length && result[result.length - 1] === '') result.pop();

    setContent(result.join('\n'));
  }, [state.content, setContent]);

  const handleCheckConsistency = useCallback(async () => {
    if (!activeDraft || !settings.apiKey) {
      setConsistencyError('请先在设置中填写 API Key');
      return;
    }
    setIsCheckingConsistency(true);
    setConsistencyError(null);
    setConsistencyIssues(null);
    const tfMap: Record<string, string> = {};
    for (const tf of truthFiles) {
      if (tf.truthFileType) tfMap[tf.truthFileType] = tf.content;
    }
    try {
      const issues = await checkConsistency(activeDraft.content, tfMap, settings);
      setConsistencyIssues(issues);
    } catch (err) {
      setConsistencyError(err instanceof Error ? err.message : '检查失败，请重试');
    } finally {
      setIsCheckingConsistency(false);
    }
  }, [activeDraft, settings, truthFiles]);

  const handleGenerateOutline = useCallback(async () => {
    if (!activeBook?.synopsis || !settings.apiKey) return;
    setIsGeneratingOutline(true);
    try {
      const cards = await generateOutline(activeBook.synopsis, bookChapters(activeBookId).length, settings);
      const outlineCards: OutlineCard[] = cards.map((c, i) => ({
        id: `oc_${Date.now()}_${i}`,
        title: c.title,
        synopsis: c.synopsis,
        status: 'planned' as const,
        order: outline.cards.length + i,
      }));
      outline.setAllCards([...outline.cards, ...outlineCards]);
    } catch (err) {
      console.error('[outline] generate failed', err);
    } finally {
      setIsGeneratingOutline(false);
    }
  }, [activeBook, settings, bookChapters, activeBookId, outline]);

  const allDraftsForExport: Draft[] = bookChapters(activeBookId);
  const isLoading = !booksLoaded || !memoriesLoaded;

  // ── 渲染 ──────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      {isLoading && (
        <div className="db-loading-overlay">
          <div className="db-loading-spinner" />
          <span className="db-loading-text">正在加载本地数据库…</span>
        </div>
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
        currentTheme={theme}
        themes={THEMES}
        onShowMemory={() => setShowMemory(true)}
        onShowStyleLearning={() => setShowStyleLearning(true)}
        imitationMode={settings.imitationMode}
        modularWriting={settings.modularWriting}
        onClear={handleClear}
        onUndo={undoClear}
        onOpenSettings={() => setShowSettings(true)}
        onStyleChange={(style) => setSettings({ ...settings, style })}
        onToggleInstruction={() => setShowInstruction(v => !v)}
        onThemeChange={setTheme}
      />

      {showInstruction && (
        <InstructionBar
          value={settings.customPrompt}
          presets={settings.promptPresets ?? []}
          onChange={v => setSettings({ ...settings, customPrompt: v })}
          onPresetsChange={presets => setSettings({ ...settings, promptPresets: presets })}
        />
      )}

      <div className="app-body">
        <Sidebar
          books={books}
          chapters={chapters}
          activeBookId={activeBookId}
          activeDraftId={activeDraftId}
          completedChapterIds={completedChapterIds}
          onSelectBook={switchBook}
          onSelectChapter={selectDraft}
          onCreateBook={() => setShowCreateBook(true)}
          onCreateChapter={createChapter}
          onDeleteBook={deleteBook}
          onDeleteChapter={deleteChapter}
          onRenameChapter={updateChapterTitle}
          onRenameBook={(id, title) => updateBookMeta(id, { title })}
          onReorderChapter={reorderChapters}
          onOpenOutline={() => setShowOutline(true)}
        />

        <main className="main-content">
          {activeBook && (
            <div className="book-context-bar">
              <span className="book-context-title">📖 {activeBook.title}</span>
              {activeBook.synopsis && (
                <button
                  className="synopsis-toggle btn btn-ghost"
                  style={{ fontSize: 11, padding: '2px 6px' }}
                  onClick={() => setSynopsisVisible(v => !v)}
                  title={synopsisVisible ? '收起简介' : '展开简介'}
                >
                  {synopsisVisible ? '▲ 简介' : '▼ 简介'}
                </button>
              )}
              {activeBook.synopsis && synopsisVisible && (
                <span className="book-context-synopsis">{activeBook.synopsis}</span>
              )}
              <div className="book-context-actions">
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowStats(true)}
                  title="写作统计"
                >
                  📊 统计
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowCrossSearch(true)}
                  title="全书搜索 (Ctrl+Shift+F)"
                >
                  🔭 全书搜索
                </button>
              </div>
            </div>
          )}
          <div className="editor-card">
            {!activeDraft && books.length > 0 && (
              <div className="editor-empty-state">
                <div className="empty-state-icon">✍️</div>
                <div className="empty-state-title">选择或新建章节开始创作</div>
                <div className="empty-state-hint">
                  <span>从左侧侧边栏选择章节</span>
                  <span className="empty-state-sep">·</span>
                  <span>或点击「+ 新增章节」</span>
                </div>
                <div className="empty-state-shortcuts">
                  <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 续写</span>
                  <span><kbd>Ctrl</kbd>+<kbd>F</kbd> 查找</span>
                  <span><kbd>Ctrl</kbd>+<kbd>=/-</kbd> 字号</span>
                </div>
              </div>
            )}
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
                    onClick={() => { setChapterTitleDraft(activeDraft.title); setEditingChapterTitle(true); }}
                    title="点击修改章节名"
                  >
                    {activeDraft.title}
                    <span className="chapter-title-edit-hint">✎</span>
                  </button>
                )}
                <div className="chapter-title-bar-actions">
                  <button
                    className="btn btn-ghost chapter-action-btn"
                    onClick={() => setShowSnapshot(true)}
                    title="章节版本历史"
                  >
                    🕐 历史
                  </button>
                  <button
                    className="btn btn-ghost chapter-action-btn"
                    onClick={() => { setConsistencyIssues(null); setConsistencyError(null); setShowConsistency(true); }}
                    title="AI 一致性检查"
                  >
                    🔍 检查
                  </button>
                  <button
                    className="btn btn-complete-chapter"
                    onClick={chapterComplete.openModal}
                    disabled={state.isStreaming || state.isPolishing}
                    title="完成本章，AI 自动提取七个真相文件"
                  >
                    ✓ 完成章节
                  </button>
                </div>
              </div>
            )}
            {!isOnline && (
              <div className="offline-banner">
                📵 当前处于离线状态，AI 功能不可用
              </div>
            )}
            <div className="command-bar-row">
              <CommandBar
                disabled={!isOnline || state.isStreaming || state.isPolishing || state.hasPendingContinuation || state.pendingPolish !== null || state.isGeneratingVersions}
                isStreaming={state.isStreaming}
                isPolishing={state.isPolishing}
                isGeneratingVersions={state.isGeneratingVersions}
                onContinue={continueWriting}
                onPolish={polish}
                onMultiVersion={generateVersions}
              />
              <button
                className="btn btn-ghost scene-tpl-btn"
                onClick={handleFormat}
                disabled={!state.content.trim()}
                title="一键排版：段首缩进 + 去多余空行"
              >
                ¶
              </button>
              <button
                className="btn btn-ghost scene-tpl-btn"
                onClick={() => setShowSceneTemplates(true)}
                title="插入场景模板"
              >
                🎬
              </button>
            </div>
            {findMode && (
              <FindReplace
                content={state.content}
                mode={findMode}
                onClose={() => { setFindMode(null); setFindFocusRange(null); }}
                onChange={setContent}
                onMatchFocus={(start, end) => setFindFocusRange({ start, end })}
              />
            )}
            {/* 两栏布局：左=正文，右=AI建议 */}
            <div className={`editor-split ${(state.isStreaming || state.hasPendingContinuation || state.isPolishing || state.pendingPolish !== null) ? 'has-suggestion' : ''}`}>
              <Editor
                content={state.content}
                chapterTitle={activeDraft?.title}
                isStreaming={state.isStreaming}
                isPolishing={state.isPolishing}
                aiInsertRange={state.aiInsertRange}
                hasPendingContinuation={state.hasPendingContinuation}
                pendingPolish={state.pendingPolish}
                focusRange={findFocusRange}
                fontSize={settings.editorFontSize}
                editorFont={settings.editorFont}
                writingBlocks={settings.modularWriting ? state.writingBlocks : []}
                onChange={setContent}
                onContinue={continueWriting}
                onAcceptContinuation={() => { acceptContinuation(); recordAiAccepted(); }}
                onRejectContinuation={() => { rejectContinuation(); recordAiRejected(); }}
                onAcceptPolish={()  => { acceptPolish(); recordAiAccepted(); }}
                onRejectPolish={() => { rejectPolish(); recordAiRejected(); }}
                onSelectionChange={setSelectionRange}
              />
              <AiSuggestionPanel
                content={state.content}
                isStreaming={state.isStreaming}
                isPolishing={state.isPolishing}
                pendingContinuation={state.pendingContinuation}
                hasPendingContinuation={state.hasPendingContinuation}
                isTruncated={state.isTruncated}
                pendingPolish={state.pendingPolish}
                onAcceptContinuation={() => {
                  const accepted = state.pendingContinuation;
                  acceptContinuation();
                  recordAiAccepted();
                  // 异步提取风格偏好，写入记忆（不阻塞主流程）
                  if (accepted.length >= 80 && settings.apiKey) {
                    extractWritingPreference(accepted, settings).then(pref => {
                      if (pref.trim()) {
                        addMemory({ name: '写作风格偏好（自动）', description: '从接受的续写中提炼的风格规律', type: 'project', content: pref, bookId: activeBookId });
                      }
                    }).catch(() => {});
                  }
                }}
                onRejectContinuation={() => { rejectContinuation(); recordAiRejected(); }}
                onResumeWriting={resumeWriting}
                onAcceptPolish={() => { acceptPolish(); recordAiAccepted(); }}
                onRejectPolish={() => { rejectPolish(); recordAiRejected(); }}
              />
            </div>
          </div>
        </main>
      </div>

      <StatusBar
        content={state.content}
        isStreaming={state.isStreaming}
        isPolishing={state.isPolishing}
        isGeneratingVersions={state.isGeneratingVersions}
        error={state.error}
        savedAt={savedAt}
        wordGoal={settings.wordGoal ?? 0}
        compactionCount={activeDraft?.contextState.compactionCount ?? 0}
        compactDisabled={activeDraft?.contextState.compactDisabled ?? false}
        creativity={settings.creativity}
      />

      {showMemory && (
        <MemoryPanel
          entries={memoryEntries}
          truthFiles={truthFiles}
          onAdd={addMemory}
          onUpdate={updateMemory}
          onRemove={removeMemory}
          onUpdateTruthFile={(id, content) => updateMemory(id, { content })}
          onClose={() => setShowMemory(false)}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s: AppSettings) => setSettings(s)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {chapterComplete.showModal && activeDraft && (
        <ChapterCompleteModal
          chapterTitle={activeDraft.title}
          wordCount={activeDraft.content.replace(/\s/g, '').length}
          status={chapterComplete.status}
          extractedKeys={chapterComplete.extractedKeys}
          error={chapterComplete.error}
          onConfirm={chapterComplete.execute}
          onClose={() => {
            if (chapterComplete.status === 'done' && activeDraftId) {
              setCompletedChapterIdsArr(prev => prev.includes(activeDraftId) ? prev : [...prev, activeDraftId]);
            }
            chapterComplete.closeModal();
          }}
        />
      )}

      {showCreateBook && (
        <CreateBookModal
          isFirst={books.length === 0}
          onConfirm={async (title, synopsis) => {
            await createBook(title, synopsis);
            setShowCreateBook(false);
          }}
          onConfirmImport={async (bookTitle, chapters) => {
            await createBookWithChapters(bookTitle, '', chapters);
            setShowCreateBook(false);
          }}
          onCancel={() => setShowCreateBook(false)}
        />
      )}

      {/* 多版本续写选择面板 */}
      {state.pendingVersions && state.pendingVersions.length > 0 && (
        <VersionPickerPanel
          versions={state.pendingVersions}
          onSelect={selectVersion}
          onDismiss={dismissVersions}
        />
      )}

      {/* 章节版本历史 */}
      {showSnapshot && activeDraft && (
        <SnapshotPanel
          snapshots={snapshots}
          overLimitWarning={overLimitWarning}
          onRestore={content => { setContent(content); }}
          onDelete={deleteSnapshot}
          onPin={pinSnapshot}
          onManualSave={() => saveSnapshot(state.content, activeDraft.title, '手动存档')}
          onDismissWarning={dismissOverLimitWarning}
          onClose={() => setShowSnapshot(false)}
        />
      )}

      {/* 一致性检查 */}
      {showConsistency && (
        <ConsistencyPanel
          issues={consistencyIssues}
          isChecking={isCheckingConsistency}
          error={consistencyError}
          onCheck={handleCheckConsistency}
          onClose={() => setShowConsistency(false)}
        />
      )}

      {/* 全书跨章节搜索 */}
      {showCrossSearch && (
        <CrossChapterSearch
          chapters={bookChapters(activeBookId)}
          onNavigate={chapterId => { selectDraft(chapterId); }}
          onClose={() => setShowCrossSearch(false)}
        />
      )}

      {/* 写作统计 */}
      {showStats && (
        <StatsPanel stats={writingStats} onClose={() => setShowStats(false)} />
      )}

      {/* 快捷键帮助 */}
      {showShortcutHelp && (
        <ShortcutHelpPanel onClose={() => setShowShortcutHelp(false)} />
      )}

      {/* 场景模板库 */}
      {showSceneTemplates && (
        <SceneTemplates
          onInsert={insertAtCursor}
          onClose={() => setShowSceneTemplates(false)}
        />
      )}

      {/* 文风学习面板 */}
      {showStyleLearning && (
        <StyleLearningPanel
          profiles={styleProfiles}
          status={styleStatus}
          errorMsg={styleError}
          drafts={bookChapters(activeBookId)}
          sourceBookId={activeBookId ?? ''}
          activeProfileId={settings.imitationProfileId ?? ''}
          imitationMode={settings.imitationMode ?? false}
          modularWriting={settings.modularWriting ?? false}
          onCreateProfile={createStyleProfile}
          onDeleteProfile={deleteStyleProfile}
          onRenameProfile={renameStyleProfile}
          onSelectProfile={id => setSettings({ ...settings, imitationProfileId: id })}
          onToggleImitation={on => setSettings({ ...settings, imitationMode: on })}
          onToggleModular={on => setSettings({ ...settings, modularWriting: on })}
          onClose={() => setShowStyleLearning(false)}
        />
      )}

      {/* 大纲规划板 */}
      {showOutline && (
        <OutlinePanel
          cards={outline.cards}
          bookTitle={activeBook?.title ?? ''}
          bookSynopsis={activeBook?.synopsis ?? ''}
          isGenerating={isGeneratingOutline}
          canvasPositions={outline.canvasPositions}
          settings={settings}
          onAdd={outline.addCard}
          onUpdate={outline.updateCard}
          onDelete={outline.deleteCard}
          onReorder={outline.reorderCards}
          onGenerate={handleGenerateOutline}
          onNodeMove={outline.setNodePosition}
          onClose={() => setShowOutline(false)}
        />
      )}

    </div>
  );
}

export default App;
