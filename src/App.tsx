// =============================================================
// App.tsx — 根组件（协调层，不含业务逻辑）
// 业务逻辑已下沉到各专用 Hook，此处仅负责组装和渲染。
// =============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Toolbar }              from './components/Toolbar';
import { Editor }               from './components/Editor';
import { AiSuggestionPanel }    from './components/AiSuggestionPanel';
import { StatusBar }            from './components/StatusBar';
import { InstructionBar }       from './components/InstructionBar';
import { CommandBar }           from './components/CommandBar';
import { FindReplace }          from './components/FindReplace';
import { InlineAiMenu }         from './components/InlineAiMenu';
import { LeftSidebar }          from './components/layout/LeftSidebar';
import { RightSidebar }         from './components/layout/RightSidebar';
import { GlobalModals }         from './components/layout/GlobalModals';

import { useWritingStats }      from './hooks/useWritingStats';
import { useStorage }           from './hooks/useStorage';
import { useEditor }            from './hooks/useEditor';
import { useBooks }             from './hooks/useBooks';
import { useMemory }            from './hooks/useMemory';
import { useAutoSave }          from './hooks/useAutoSave';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSnapshots }         from './hooks/useSnapshots';
import { useOutline }           from './hooks/useOutline';
import { useTheme }             from './hooks/useTheme';
import { useStyleLearning }     from './hooks/useStyleLearning';
import { useCapsules }          from './hooks/useCapsules';
import { useOnlineStatus }      from './hooks/useOnlineStatus';
import type { Draft }           from './hooks/useBooks';
import { checkConsistency, generateOutline, extractEntitiesFromAccepted, explainText } from './api/gemini';
import type { ConsistencyIssue } from './api/gemini';
import type { OutlineCard }     from './hooks/useOutline';
import { DEFAULT_SETTINGS } from './types';
import type { AppSettings, PolishMode } from './types';
import { migrateSettings }      from './utils/settingsMigration';
import { formatNovelText }      from './utils/formatNovelText';
import { getCacheStats }        from './api/cache';
import { migrateFromLocalStorage } from './db/index';
import { formatStyleForPrompt }    from './api/styleAnalysis';
import { PREV_CHAPTER_TAIL_CHARS } from './config/constants';
import { usePanelStore } from './store/panelStore';
import { useNovelStore } from './store/useNovelStore';
import './App.css';

function App() {
  const [rawSettings, setSettings] = useStorage<AppSettings>('novel-ai-settings', DEFAULT_SETTINGS);
  const settings: AppSettings = useMemo(() => migrateSettings({ ...rawSettings }), [rawSettings]);
  const { theme, setTheme, THEMES } = useTheme();
  const isOnline = useOnlineStatus();
  const storeTheme = useNovelStore((state) => state.theme);

  // Global panel state lives in Zustand so layout children can open/close panels directly.
  const openPanel = usePanelStore((state) => state.openPanel);
  const findMode = usePanelStore((state) => state.findMode);
  const showInstruction = usePanelStore((state) => state.showInstruction);
  const openPanelAction = usePanelStore((state) => state.openPanel_action);
  const closePanel = usePanelStore((state) => state.closePanel);
  const toggleFind = usePanelStore((state) => state.toggleFind);
  const closeFind = usePanelStore((state) => state.closeFind);
  const toggleInstruction = usePanelStore((state) => state.toggleInstruction);

  const [findFocusRange, setFindFocusRange]   = useState<{ start: number; end: number } | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft]     = useState('');
  const [consistencyIssues, setConsistencyIssues] = useState<ConsistencyIssue[] | null>(null);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [manualSavedAt,      setManualSavedAt]      = useState<number | null>(null);
  const [capsuleHighlight,   setCapsuleHighlight]   = useState<string | undefined>();
  const [synopsisVisible, setSynopsisVisible] = useState(true);
  const [completedChapterIdsArr, setCompletedChapterIdsArr] = useStorage<string[]>('novel-completed-chapters', []);
  const completedChapterIds = new Set(completedChapterIdsArr);
  const [showChapterComplete, setShowChapterComplete] = useState(false);

  // ── 数据层 Hook ───────────────────────────────────────────
  const {
    books, chapters, activeBook, activeDraft,
    activeBookId, activeDraftId, loaded: booksLoaded,
    bookChapters, createBook, createBookWithChapters, updateBookMeta, deleteBook,
    switchBook, selectDraft, createChapter, deleteChapter,
    updateChapterTitle, updateContent, updateContextState, updateChapterSummary,
    reorderChapters, flushAll,
  } = useBooks();

  const {
    characters: memoryCharacters,
    worldRules: memoryWorldRules,
    chapterSummaries: memoryChapterSummaries,
    notes: memoryNotes,
    loaded: memoriesLoaded,
    add: addMemory, update: updateMemory, remove: removeMemory,
    upsertExtracted, refresh: refreshMemory,
    memoryContext, buildContextForQuery,
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
    if (booksLoaded && memoriesLoaded && books.length === 0) openPanelAction('createBook');
  }, [booksLoaded, memoriesLoaded, books.length, openPanelAction]);

  // ── 胶囊场景函数稳定引用（先声明 ref，useCapsules 在后面初始化后更新）────
  // 使用 ref 桥接避免 useCapsules 必须在 useEditor 之前调用的问题
  const buildSceneContextRef = useRef<(text: string) => string>(() => '');
  const buildSceneContextStable = useCallback((text: string) => buildSceneContextRef.current(text), []);

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
    polish, rewriteSelection, acceptPolish, rejectPolish,
    generateVersions, selectVersion, dismissVersions,
    clear, undoClear, insertAtCursor, resetBlocks, resetPendingState,
  } = useEditor(
    settings,
    activeDraft?.content ?? '',
    memoryContext,
    buildContextForQuery,
    activeDraft?.contextState,
    (next) => { if (activeDraftId) updateContextState(activeDraftId, next); },
    prevChapterTail,
    activeStyleBlock,
    buildSceneContextStable,
  );

  const currentDraftContent = activeDraft?.id === activeDraftId
    ? state.content
    : (activeDraft?.content ?? '');

  const chapterCompleteDraft = useMemo(
    () => (activeDraft ? { ...activeDraft, content: currentDraftContent } : null),
    [activeDraft, currentDraftContent],
  );

  const buildSyncedChapters = useCallback((): Draft[] => {
    if (!activeDraftId) return chapters;

    const updatedAt = Date.now();
    return chapters.map(chapter => (
      chapter.id === activeDraftId
        ? { ...chapter, content: state.content, updatedAt }
        : chapter
    ));
  }, [activeDraftId, chapters, state.content]);

  // 章节���换时同步编辑器内容
  useEffect(() => {
    if (activeDraft) setContent(activeDraft.content);
    resetBlocks();
    resetPendingState();
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
    onFind:         () => toggleFind('find'),
    onReplace:      () => toggleFind('replace'),
    onCrossSearch:  () => { if (openPanel === 'crossSearch') closePanel(); else openPanelAction('crossSearch'); },
    onFontIncrease: () => setSettings(s => ({ ...s, editorFontSize: Math.min(26, (s.editorFontSize ?? 17) + 1) })),
    onFontDecrease: () => setSettings(s => ({ ...s, editorFontSize: Math.max(12, (s.editorFontSize ?? 17) - 1) })),
    onHelp:         () => { if (openPanel === 'shortcutHelp') closePanel(); else openPanelAction('shortcutHelp'); },
    onEscape:       () => { if (openPanel) closePanel(); else if (findMode) closeFind(); else if (showInstruction) toggleInstruction(); },
    onSave:         () => {
      if (activeDraftId) updateContent(activeDraftId, state.content);
      void flushAll(buildSyncedChapters());
      setManualSavedAt(Date.now());
    },
  });

  const { snapshots, saveSnapshot, deleteSnapshot, pinSnapshot, overLimitWarning, dismissOverLimitWarning } = useSnapshots(
    activeDraft?.id ?? '',
    activeBookId,
  );

  const outline = useOutline(activeBookId);
  const currentOutlineCard = useMemo(
    () => (activeDraft ? outline.cards.find(card => card.order === activeDraft.order) ?? null : null),
    [activeDraft, outline.cards],
  );

  const allChaptersTotalWords = bookChapters(activeBookId).reduce((s, c) => s + c.content.replace(/\s/g, '').length, 0);
  const { stats: writingStats, recordWords, recordAiAccepted, recordAiRejected } = useWritingStats(allChaptersTotalWords);
  const statsBookIdRef = useRef('');
  const prevTrackedWordsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeBookId) {
      statsBookIdRef.current = '';
      prevTrackedWordsRef.current = allChaptersTotalWords;
      return;
    }

    if (statsBookIdRef.current !== activeBookId) {
      statsBookIdRef.current = activeBookId;
      prevTrackedWordsRef.current = allChaptersTotalWords;
      return;
    }

    if (prevTrackedWordsRef.current == null) {
      prevTrackedWordsRef.current = allChaptersTotalWords;
      return;
    }

    const delta = allChaptersTotalWords - prevTrackedWordsRef.current;
    prevTrackedWordsRef.current = allChaptersTotalWords;

    if (delta > 0) recordWords(delta);
  }, [activeBookId, allChaptersTotalWords, recordWords]);

  // ── 角色胶囊库 ───────────────────────────────────────────────
  const {
    capsules,
    stats: capsuleStats,
    create: createCapsule,
    update: updateCapsule,
    remove: removeCapsule,
    migrateFromMemory: migrateCapsuleFromMemory,
    buildSceneContext,
  } = useCapsules(activeBookId);
  // 将最新的 buildSceneContext 同步到 ref，useEditor 通过 buildSceneContextStable 访问
  buildSceneContextRef.current = buildSceneContext;


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
    const formatted = formatNovelText(state.content);
    if (formatted) setContent(formatted);
  }, [state.content, setContent]);

  const handleCheckConsistency = useCallback(async () => {
    if (!activeDraft || !settings.apiKey) {
      setConsistencyError('请先在设置中填写 API Key');
      return;
    }
    setIsCheckingConsistency(true);
    setConsistencyError(null);
    setConsistencyIssues(null);
    // 将记忆宫殿角色档案 + 世界设定作为一致性基准
    const tfMap: Record<string, string> = {};
    for (const c of memoryCharacters) tfMap[`角色_${c.name}`] = c.content;
    for (const w of memoryWorldRules)  tfMap[`设定_${w.name}`] = w.content;
    try {
      const issues = await checkConsistency(currentDraftContent, tfMap, settings);
      setConsistencyIssues(issues);
    } catch (err) {
      setConsistencyError(err instanceof Error ? err.message : '检查失败，请重试');
    } finally {
      setIsCheckingConsistency(false);
    }
  }, [activeDraft, currentDraftContent, settings, memoryCharacters, memoryWorldRules]);

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
    <div className={`app theme-${storeTheme}`}>
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
        currentTheme={theme}
        themes={THEMES}
        onClear={handleClear}
        onUndo={undoClear}
        onOpenSettings={() => openPanelAction('settings')}
        onThemeChange={setTheme}
      />

      <div className={`instruction-bar-wrapper ${showInstruction ? 'instruction-bar-wrapper--open' : ''}`}>
        <InstructionBar
          value={settings.customPrompt}
          presets={settings.promptPresets ?? []}
          onChange={v => setSettings({ ...settings, customPrompt: v })}
          onPresetsChange={presets => setSettings({ ...settings, promptPresets: presets })}
        />
      </div>

      <div className="app-body">
        <LeftSidebar
          books={books}
          chapters={chapters}
          activeBookId={activeBookId}
          activeDraftId={activeDraftId}
          completedChapterIds={completedChapterIds}
          onSelectBook={switchBook}
          onSelectChapter={selectDraft}
          onCreateBook={() => openPanelAction('createBook')}
          onCreateChapter={createChapter}
          onDeleteBook={deleteBook}
          onDeleteChapter={deleteChapter}
          onRenameChapter={updateChapterTitle}
          onRenameBook={(id, title) => updateBookMeta(id, { title })}
          onReorderChapter={reorderChapters}
          onOpenOutline={() => openPanelAction('outline')}
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
                  onClick={() => openPanelAction('stats')}
                  title="写作统计"
                >
                  📊 统计
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => openPanelAction('crossSearch')}
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
                    onClick={() => openPanelAction('snapshot')}
                    title="章节版本历史"
                  >
                    🕐 历史
                  </button>
                  <button
                    className="btn btn-ghost chapter-action-btn"
                    onClick={() => { setConsistencyIssues(null); setConsistencyError(null); openPanelAction('consistency'); }}
                    title="AI 一致性检查"
                  >
                    🔍 检查
                  </button>
                  <button
                    className="btn btn-ghost chapter-action-btn"
                    onClick={() => openPanelAction('aiDetect')}
                    title="去AI化检测"
                  >
                    🕵️ AI检测
                  </button>
                  <button
                    className="btn btn-complete-chapter"
                    onClick={() => setShowChapterComplete(true)}
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
                onPolish={(prompt: string, mode: PolishMode) => polish(prompt, mode)}
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
                onClick={() => openPanelAction('sceneTemplates')}
                title="插入场景模板"
              >
                🎬
              </button>
            </div>
            {findMode && (
              <FindReplace
                content={state.content}
                mode={findMode}
                onClose={() => { closeFind(); setFindFocusRange(null); }}
                onChange={setContent}
                onMatchFocus={(start, end) => setFindFocusRange({ start, end })}
              />
            )}
            {/* 两栏布局：左=正文，右=AI建议 */}
            <div className={`editor-split ${(state.isStreaming || state.hasPendingContinuation || state.isPolishing || state.pendingPolish !== null) ? 'has-suggestion' : ''}`}>
              <Editor
                content={state.content}
                bookId={activeBookId ?? null}
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
                  // 异步提取实体到记忆宫殿（不阻塞主流程）
                  if (accepted.length >= 60 && settings.apiKey && activeBookId) {
                    extractEntitiesFromAccepted(accepted, settings)
                      .then(items => upsertExtracted(items))
                      .catch(() => {});
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

        {/* ── 右侧工具侧边栏 ──────────────────────────────── */}
        <RightSidebar
          bookId={activeBookId ?? null}
          onGraphNodeClick={(name, type) => {
            if (type === 'character') {
              setCapsuleHighlight(name);
            }
          }}
          onToggleInstruction={toggleInstruction}
          currentChapterNumber={activeDraft ? activeDraft.order + 1 : undefined}
          currentChapterOutline={currentOutlineCard?.synopsis ?? ''}
          onWriteBeat={continueWriting}
          onContinue={continueWriting}
          onPolish={() => polish('', 'standard')}
          canAcceptSuggestion={state.hasPendingContinuation || state.pendingPolish !== null}
          aiActionsDisabled={
            !isOnline ||
            state.isStreaming ||
            state.isPolishing ||
            state.hasPendingContinuation ||
            state.pendingPolish !== null ||
            state.isGeneratingVersions
          }
          onAcceptSuggestion={() => {
            if (state.pendingPolish) {
              acceptPolish();
              recordAiAccepted();
            } else if (state.hasPendingContinuation) {
              acceptContinuation();
              recordAiAccepted();
            }
          }}
          onRejectSuggestion={() => {
            if (state.pendingPolish) {
              rejectPolish();
              recordAiRejected();
            } else if (state.hasPendingContinuation) {
              rejectContinuation();
              recordAiRejected();
            }
          }}
        />
      </div>

      <StatusBar
        content={state.content}
        isStreaming={state.isStreaming}
        isPolishing={state.isPolishing}
        isGeneratingVersions={state.isGeneratingVersions}
        error={state.error}
        savedAt={Math.max(savedAt ?? 0, manualSavedAt ?? 0) || null}
        wordGoal={settings.wordGoal ?? 0}
        compactionCount={activeDraft?.contextState.compactionCount ?? 0}
        compactDisabled={activeDraft?.contextState.compactDisabled ?? false}
        creativity={settings.creativity}
      />

      <GlobalModals
        settings={settings}
        setSettings={setSettings}
        booksCount={books.length}
        createBook={createBook}
        createBookWithChapters={createBookWithChapters}
        showChapterComplete={showChapterComplete}
        setShowChapterComplete={setShowChapterComplete}
        chapterCompleteDraft={chapterCompleteDraft}
        currentDraftWordCount={currentDraftContent.replace(/\s/g, '').length}
        activeBookId={activeBookId ?? null}
        onChapterCompleteDone={(draftId, summary) => {
          updateChapterSummary(draftId, summary);
          setCompletedChapterIdsArr(prev => (
            prev.includes(draftId) ? prev : [...prev, draftId]
          ));
          refreshMemory();
        }}
        saveSnapshot={saveSnapshot}
        chapterSummaries={memoryChapterSummaries}
        notes={memoryNotes}
        addMemory={addMemory}
        updateMemory={updateMemory}
        removeMemory={removeMemory}
        pendingVersions={state.pendingVersions}
        selectVersion={selectVersion}
        dismissVersions={dismissVersions}
        activeDraft={activeDraft ?? null}
        snapshots={snapshots}
        overLimitWarning={overLimitWarning}
        setContent={setContent}
        deleteSnapshot={deleteSnapshot}
        pinSnapshot={pinSnapshot}
        content={state.content}
        dismissOverLimitWarning={dismissOverLimitWarning}
        consistencyIssues={consistencyIssues}
        isCheckingConsistency={isCheckingConsistency}
        consistencyError={consistencyError}
        handleCheckConsistency={handleCheckConsistency}
        bookChapters={bookChapters(activeBookId)}
        selectDraft={selectDraft}
        writingStats={writingStats}
        insertAtCursor={insertAtCursor}
        styleProfiles={styleProfiles}
        styleStatus={styleStatus}
        styleError={styleError}
        createStyleProfile={createStyleProfile}
        deleteStyleProfile={deleteStyleProfile}
        renameStyleProfile={renameStyleProfile}
        isPolishing={state.isPolishing}
        polishAntiDetect={() => polish('', 'anti-detect')}
        capsules={capsules}
        memoryCharacters={memoryCharacters}
        capsuleStats={capsuleStats}
        createCapsule={createCapsule}
        updateCapsule={updateCapsule}
        removeCapsule={removeCapsule}
        migrateCapsuleFromMemory={migrateCapsuleFromMemory}
        capsuleHighlight={capsuleHighlight}
        clearCapsuleHighlight={() => setCapsuleHighlight(undefined)}
        outline={outline}
        activeBookTitle={activeBook?.title ?? ''}
        activeBookSynopsis={activeBook?.synopsis ?? ''}
        isGeneratingOutline={isGeneratingOutline}
        handleGenerateOutline={handleGenerateOutline}
      />

      <InlineAiMenu
        disabled={
          !isOnline ||
          state.isStreaming ||
          state.isPolishing ||
          state.hasPendingContinuation ||
          state.pendingPolish !== null ||
          state.isGeneratingVersions
        }
        onPolish={() => polish('', 'standard')}
        onContinue={continueWriting}
        onRewrite={rewriteSelection}
        onExplain={(text) => explainText(text, settings)}
      />

    </div>
  );
}

export default App;
