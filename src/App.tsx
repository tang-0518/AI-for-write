// =============================================================
// App.tsx — 根组件（协调层，不含业务逻辑）
// 业务逻辑已下沉到各专用 Hook，此处仅负责组装和渲染。
// =============================================================

import { useState, useEffect, useCallback, useReducer, useRef, useMemo, lazy, Suspense } from 'react';
import { Toolbar }              from './components/Toolbar';
import { Editor }               from './components/Editor';
import { AiSuggestionPanel }    from './components/AiSuggestionPanel';
import { StatusBar }            from './components/StatusBar';
import { Sidebar }              from './components/Sidebar';
import { InstructionBar }       from './components/InstructionBar';
import { CommandBar }           from './components/CommandBar';
import { FindReplace }          from './components/FindReplace';

// ── 懒加载面板组件（仅在用户打开时加载） ────────────────────────
const SettingsModal        = lazy(() => import('./components/SettingsModal'));
const MemoryPanel          = lazy(() => import('./components/MemoryPanel'));
const CreateBookModal      = lazy(() => import('./components/CreateBookModal'));
const ChapterCompleteModal = lazy(() => import('./components/ChapterCompleteModal'));
const SnapshotPanel        = lazy(() => import('./components/SnapshotPanel'));
const VersionPickerPanel   = lazy(() => import('./components/VersionPickerPanel'));
const ConsistencyPanel     = lazy(() => import('./components/ConsistencyPanel'));
const CrossChapterSearch   = lazy(() => import('./components/CrossChapterSearch'));
const OutlinePanel         = lazy(() => import('./components/OutlinePanel'));
const SceneTemplates       = lazy(() => import('./components/SceneTemplates'));
const StyleLearningPanel   = lazy(() => import('./components/StyleLearningPanel'));
const ShortcutHelpPanel    = lazy(() => import('./components/ShortcutHelpPanel'));
const StatsPanel           = lazy(() => import('./components/StatsPanel'));
const PlotHooksPanel       = lazy(() => import('./components/PlotHooksPanel'));
const AiDetectionPanel     = lazy(() => import('./components/AiDetectionPanel'));
const CapsulePanel         = lazy(() => import('./components/CapsulePanel'));
const CharacterPanel       = lazy(() => import('./components/CharacterPanel'));
const MemorySidebar        = lazy(() => import('./components/MemorySidebar'));

import { useWritingStats }      from './hooks/useWritingStats';
import { usePlotHooks }         from './hooks/usePlotHooks';
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
import { checkConsistency, generateOutline, extractEntitiesFromAccepted } from './api/gemini';
import type { ConsistencyIssue } from './api/gemini';
import type { OutlineCard }     from './hooks/useOutline';
import { DEFAULT_SETTINGS } from './types';
import type { AppSettings, PolishMode } from './types';
import { migrateSettings }      from './utils/settingsMigration';
import { getCacheStats }        from './api/cache';
import { migrateFromLocalStorage } from './db/index';
import { formatStyleForPrompt }    from './api/styleAnalysis';
import { PREV_CHAPTER_TAIL_CHARS } from './config/constants';
import './App.css';

// ── 面板状态 useReducer ────────────────────────────────────────
type PanelType =
  | 'settings' | 'memory' | 'snapshot' | 'consistency'
  | 'crossSearch' | 'outline' | 'sceneTemplates' | 'shortcutHelp'
  | 'stats' | 'styleLearning' | 'plotHooks' | 'aiDetect'
  | 'createBook' | null;

interface PanelState {
  openPanel: PanelType;
  findMode: 'find' | 'replace' | null;
  showInstruction: boolean;
}

type PanelAction =
  | { type: 'OPEN_PANEL'; panel: Exclude<PanelType, null> }
  | { type: 'CLOSE_PANEL' }
  | { type: 'TOGGLE_FIND'; mode: 'find' | 'replace' }
  | { type: 'CLOSE_FIND' }
  | { type: 'TOGGLE_INSTRUCTION' };

function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'OPEN_PANEL':
      return { ...state, openPanel: action.panel };
    case 'CLOSE_PANEL':
      return { ...state, openPanel: null };
    case 'TOGGLE_FIND':
      return { ...state, findMode: state.findMode === action.mode ? null : action.mode };
    case 'CLOSE_FIND':
      return { ...state, findMode: null };
    case 'TOGGLE_INSTRUCTION':
      return { ...state, showInstruction: !state.showInstruction };
    default:
      return state;
  }
}

const INITIAL_PANEL_STATE: PanelState = {
  openPanel: null,
  findMode: null,
  showInstruction: false,
};

// 懒加载 fallback
const LazyFallback = () => <div className="panel-lazy-loading">加载中…</div>;

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
  const settings: AppSettings = useMemo(() => migrateSettings({ ...rawSettings }), [rawSettings]);
  const { theme, setTheme, THEMES } = useTheme();
  const isOnline = useOnlineStatus();

  // ── UI 状态（useReducer 管理互斥面板） ──────────────────────
  const [panelState, dispatch] = useReducer(panelReducer, INITIAL_PANEL_STATE);
  const { openPanel, findMode, showInstruction } = panelState;

  const [findFocusRange, setFindFocusRange]   = useState<{ start: number; end: number } | null>(null);
  const [editingChapterTitle, setEditingChapterTitle] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft]     = useState('');
  const [consistencyIssues, setConsistencyIssues] = useState<ConsistencyIssue[] | null>(null);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [showCapsule,        setShowCapsule]        = useState(false);
  const [manualSavedAt,      setManualSavedAt]      = useState<number | null>(null);
  const [capsuleHighlight,   setCapsuleHighlight]   = useState<string | undefined>();
  const [characterHighlight, setCharacterHighlight] = useState<string | undefined>();
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
    bundleSnapshot,
  } = useMemory(activeBookId, activeBook?.title);

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
    if (booksLoaded && memoriesLoaded && books.length === 0) dispatch({ type: 'OPEN_PANEL', panel: 'createBook' });
  }, [booksLoaded, memoriesLoaded, books.length]);

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
    polish, acceptPolish, rejectPolish,
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
    onFind:         () => dispatch({ type: 'TOGGLE_FIND', mode: 'find' }),
    onReplace:      () => dispatch({ type: 'TOGGLE_FIND', mode: 'replace' }),
    onCrossSearch:  () => dispatch(openPanel === 'crossSearch' ? { type: 'CLOSE_PANEL' } : { type: 'OPEN_PANEL', panel: 'crossSearch' }),
    onFontIncrease: () => setSettings(s => ({ ...s, editorFontSize: Math.min(26, (s.editorFontSize ?? 17) + 1) })),
    onFontDecrease: () => setSettings(s => ({ ...s, editorFontSize: Math.max(12, (s.editorFontSize ?? 17) - 1) })),
    onHelp:         () => dispatch(openPanel === 'shortcutHelp' ? { type: 'CLOSE_PANEL' } : { type: 'OPEN_PANEL', panel: 'shortcutHelp' }),
    onEscape:       () => { if (openPanel) dispatch({ type: 'CLOSE_PANEL' }); else if (findMode) dispatch({ type: 'CLOSE_FIND' }); else if (showInstruction) dispatch({ type: 'TOGGLE_INSTRUCTION' }); },
    onSave:         () => { flushAll(chapters); setManualSavedAt(Date.now()); },
  });

  const { snapshots, saveSnapshot, deleteSnapshot, pinSnapshot, overLimitWarning, dismissOverLimitWarning } = useSnapshots(
    activeDraft?.id ?? '',
    activeBookId,
  );

  const outline = useOutline(activeBookId);

  const allChaptersTotalWords = bookChapters(activeBookId).reduce((s, c) => s + c.content.replace(/\s/g, '').length, 0);
  const { stats: writingStats, recordAiAccepted, recordAiRejected } = useWritingStats(allChaptersTotalWords);

  // ── 情节钩子 ─────────────────────────────────────────────
  const {
    hooks: plotHooks,
    urgentCount: plotHooksUrgent,
    add: addPlotHook,
    update: updatePlotHook,
    remove: removePlotHook,
    resolve: resolvePlotHook,
    defer: deferPlotHook,
    reopen: reopenPlotHook,
  } = usePlotHooks(activeBookId);

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
    // 将记忆宫殿角色档案 + 世界设定作为一致性基准
    const tfMap: Record<string, string> = {};
    for (const c of memoryCharacters) tfMap[`角色_${c.name}`] = c.content;
    for (const w of memoryWorldRules)  tfMap[`设定_${w.name}`] = w.content;
    try {
      const issues = await checkConsistency(activeDraft.content, tfMap, settings);
      setConsistencyIssues(issues);
    } catch (err) {
      setConsistencyError(err instanceof Error ? err.message : '检查失败，请重试');
    } finally {
      setIsCheckingConsistency(false);
    }
  }, [activeDraft, settings, memoryCharacters, memoryWorldRules]);

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
        currentTheme={theme}
        themes={THEMES}
        onClear={handleClear}
        onUndo={undoClear}
        onOpenSettings={() => dispatch({ type: 'OPEN_PANEL', panel: 'settings' })}
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
        <Sidebar
          books={books}
          chapters={chapters}
          activeBookId={activeBookId}
          activeDraftId={activeDraftId}
          completedChapterIds={completedChapterIds}
          onSelectBook={switchBook}
          onSelectChapter={selectDraft}
          onCreateBook={() => dispatch({ type: 'OPEN_PANEL', panel: 'createBook' })}
          onCreateChapter={createChapter}
          onDeleteBook={deleteBook}
          onDeleteChapter={deleteChapter}
          onRenameChapter={updateChapterTitle}
          onRenameBook={(id, title) => updateBookMeta(id, { title })}
          onReorderChapter={reorderChapters}
          onOpenOutline={() => dispatch({ type: 'OPEN_PANEL', panel: 'outline' })}
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
                  onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'stats' })}
                  title="写作统计"
                >
                  📊 统计
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'crossSearch' })}
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
                    onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'snapshot' })}
                    title="章节版本历史"
                  >
                    🕐 历史
                  </button>
                  <button
                    className="btn btn-ghost chapter-action-btn"
                    onClick={() => { setConsistencyIssues(null); setConsistencyError(null); dispatch({ type: 'OPEN_PANEL', panel: 'consistency' }); }}
                    title="AI 一致性检查"
                  >
                    🔍 检查
                  </button>
                  <button
                    className="btn btn-ghost chapter-action-btn"
                    onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'aiDetect' })}
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
                onClick={() => dispatch({ type: 'OPEN_PANEL', panel: 'sceneTemplates' })}
                title="插入场景模板"
              >
                🎬
              </button>
            </div>
            {findMode && (
              <FindReplace
                content={state.content}
                mode={findMode}
                onClose={() => { dispatch({ type: 'CLOSE_FIND' }); setFindFocusRange(null); }}
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

        {/* ── 右侧记忆侧边栏 ──────────────────────────────── */}
        <Suspense fallback={null}>
          <MemorySidebar
            bookId={activeBookId ?? null}
            contextBundle={bundleSnapshot}
            chapterSummaries={memoryChapterSummaries}
            notes={memoryNotes}
            onAddNote={(name, content) => addMemory({ name, content, type: 'note' })}
            onRemoveEntry={removeMemory}
            onOpenFullMemory={() => dispatch({ type: 'OPEN_PANEL', panel: 'memory' })}
            onGraphNodeClick={(name, type) => {
              if (type === 'character') setCharacterHighlight(name);
            }}
            charPanel={(onBack) => (
              <Suspense fallback={<LazyFallback />}>
                <CharacterPanel
                  bookId={activeBookId ?? null}
                  capsules={capsules}
                  onClose={onBack}
                  onInjectContext={insertAtCursor}
                  highlightName={characterHighlight}
                  onCreateCapsule={createCapsule}
                  onUpdateCapsule={updateCapsule}
                  onDeleteCapsule={removeCapsule}
                />
              </Suspense>
            )}
            hooksPanel={(onBack) => (
              <Suspense fallback={<LazyFallback />}>
                <PlotHooksPanel
                  hooks={plotHooks}
                  onAdd={addPlotHook}
                  onUpdate={updatePlotHook}
                  onRemove={removePlotHook}
                  onResolve={resolvePlotHook}
                  onDefer={deferPlotHook}
                  onReopen={reopenPlotHook}
                  onClose={onBack}
                />
              </Suspense>
            )}
            onToggleInstruction={() => dispatch({ type: 'TOGGLE_INSTRUCTION' })}
            hasInstruction={!!settings.customPrompt.trim()}
            plotHooksUrgent={plotHooksUrgent}
          />
        </Suspense>
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

      <Suspense fallback={<LazyFallback />}>
      {openPanel === 'memory' && (
        <MemoryPanel
          chapterSummaries={memoryChapterSummaries}
          notes={memoryNotes}
          onAdd={addMemory}
          onUpdate={updateMemory}
          onRemove={removeMemory}
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
          onOpenCharacters={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}

      {openPanel === 'settings' && (
        <SettingsModal
          settings={settings}
          onSave={(s: AppSettings) => setSettings(s)}
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}

      {showChapterComplete && activeDraft && activeBookId && (
        <ChapterCompleteModal
          draft={activeDraft}
          wordCount={activeDraft.content.replace(/\s/g, '').length}
          settings={settings}
          bookId={activeBookId}
          saveSnapshot={saveSnapshot}
          onDone={(summary) => {
            updateChapterSummary(activeDraft.id, summary);
            if (activeDraftId) {
              setCompletedChapterIdsArr(prev => prev.includes(activeDraftId) ? prev : [...prev, activeDraftId]);
            }
            refreshMemory();
          }}
          onClose={() => setShowChapterComplete(false)}
        />
      )}

      {openPanel === 'createBook' && (
        <CreateBookModal
          isFirst={books.length === 0}
          onConfirm={async (title, synopsis) => {
            await createBook(title, synopsis);
            dispatch({ type: 'CLOSE_PANEL' });
          }}
          onConfirmImport={async (bookTitle, chapters) => {
            await createBookWithChapters(bookTitle, '', chapters);
            dispatch({ type: 'CLOSE_PANEL' });
          }}
          onCancel={() => dispatch({ type: 'CLOSE_PANEL' })}
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
      {openPanel === 'snapshot' && activeDraft && (
        <SnapshotPanel
          snapshots={snapshots}
          overLimitWarning={overLimitWarning}
          onRestore={content => { setContent(content); }}
          onDelete={deleteSnapshot}
          onPin={pinSnapshot}
          onManualSave={() => saveSnapshot(state.content, activeDraft.title, '手动存档')}
          onDismissWarning={dismissOverLimitWarning}
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}

      {/* 一致性检查 */}
      {openPanel === 'consistency' && (
        <ConsistencyPanel
          issues={consistencyIssues}
          isChecking={isCheckingConsistency}
          error={consistencyError}
          onCheck={handleCheckConsistency}
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
          onGoComplete={() => { dispatch({ type: 'CLOSE_PANEL' }); setShowChapterComplete(true); }}
        />
      )}

      {/* 全书跨章节搜索 */}
      {openPanel === 'crossSearch' && (
        <CrossChapterSearch
          chapters={bookChapters(activeBookId)}
          onNavigate={chapterId => { selectDraft(chapterId); }}
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}

      {/* 写作统计 */}
      {openPanel === 'stats' && (
        <StatsPanel stats={writingStats} onClose={() => dispatch({ type: 'CLOSE_PANEL' })} />
      )}

      {/* 快捷键帮助 */}
      {openPanel === 'shortcutHelp' && (
        <ShortcutHelpPanel onClose={() => dispatch({ type: 'CLOSE_PANEL' })} />
      )}

      {/* 场景模板库 */}
      {openPanel === 'sceneTemplates' && (
        <SceneTemplates
          onInsert={insertAtCursor}
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}

      {/* 文风学习面板 */}
      {openPanel === 'styleLearning' && (
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
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}

      {/* 去AI化检测 */}
      {openPanel === 'aiDetect' && activeDraft && (
        <AiDetectionPanel
          content={state.content}
          isPolishing={state.isPolishing}
          onPolishAntiDetect={() => polish('', 'anti-detect')}
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}

      {/* 知识图谱已整合入右侧边栏 MiniGraph；角色管理/伏笔已整合入侧边栏子视图，此处不再渲染独立浮层 */}

      {/* 角色胶囊库（右侧抽屉，独立于 openPanel 槽） */}
      {showCapsule && (
        <div className="panel-right-overlay">
          <CapsulePanel
            capsules={capsules}
            characterMemories={memoryCharacters}
            stats={capsuleStats}
            onClose={() => { setShowCapsule(false); setCapsuleHighlight(undefined); }}
            onCreate={createCapsule}
            onUpdate={updateCapsule}
            onDelete={removeCapsule}
            onMigrateMemory={migrateCapsuleFromMemory}
            onInjectContext={(snippet: string) => insertAtCursor(snippet)}
            onViewGraph={(_name: string) => {}}
            highlightName={capsuleHighlight}
          />
        </div>
      )}

      {/* 大纲规划板 */}
      {openPanel === 'outline' && (
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
          onClose={() => dispatch({ type: 'CLOSE_PANEL' })}
        />
      )}
      </Suspense>

    </div>
  );
}

export default App;
