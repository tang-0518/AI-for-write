// =============================================================
// hooks/useEditor.ts — 编辑器状态管理 Hook
// =============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { streamContinue, streamResume, polishText } from '../api/gemini';
import type { AppSettings, DraftContextState, WritingBlock } from '../types';
import { buildMemoryContextWithCompact, maybeCompactForContinue } from '../api/contextCompression';

export interface AiInsertRange {
  start: number;
  length: number;
}

// 10 种模块化写作颜色（明暗主题均可辨）
const BLOCK_COLORS = [
  'rgba(139,92,246,0.12)',   // purple
  'rgba(59,130,246,0.12)',   // blue
  'rgba(16,185,129,0.12)',   // emerald
  'rgba(245,158,11,0.12)',   // amber
  'rgba(239,68,68,0.12)',    // red
  'rgba(6,182,212,0.12)',    // cyan
  'rgba(168,85,247,0.12)',   // violet
  'rgba(234,179,8,0.12)',    // yellow
  'rgba(20,184,166,0.12)',   // teal
  'rgba(249,115,22,0.12)',   // orange
] as const;

export const BLOCK_COLORS_ARRAY = BLOCK_COLORS;

export function useEditor(
  settings: AppSettings,
  initialContent: string = '',
  memoryContext = '',
  resolveMemoryContext?: (query: string, tokenBudget?: number) => string,
  draftContextState?: DraftContextState,
  onDraftContextStateChange?: (next: DraftContextState) => void,
  prevChapterTail = '',
  /** 模仿模式：格式化后的文风档案字符串（来自 formatStyleForPrompt） */
  styleBlock = '',
) {
  // --- 状态 ---
  const [content, setContentState] = useState(initialContent);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 撤销清空
  const [canUndo, setCanUndo] = useState(false);
  const clearSnapshotRef = useRef('');
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI 续写高亮范围（接受后触发）
  const [aiInsertRange, setAiInsertRange] = useState<AiInsertRange | null>(null);
  const aiHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 待审核：续写 ---
  const [pendingContinuation, setPendingContinuation] = useState('');
  const pendingContinuationRef = useRef('');
  const [hasPendingContinuation, setHasPendingContinuation] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false); // MAX_TOKENS 截断标志

  // --- 待审核：润色（携带原始选区范围）---
  const [pendingPolish, setPendingPolish] = useState<{ text: string; selStart: number; selEnd: number } | null>(null);

  // --- 多版本续写 ---
  const [pendingVersions, setPendingVersions] = useState<string[] | null>(null);
  const [isGeneratingVersions, setIsGeneratingVersions] = useState(false);

  // --- 模块化写作：写作块列表 ---
  const [writingBlocks, setWritingBlocks] = useState<WritingBlock[]>([]);
  const writingBlocksRef = useRef<WritingBlock[]>([]);
  writingBlocksRef.current = writingBlocks;

  // --- AbortController（取消进行中的 AI 请求）---
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortCurrent = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const newSignal = useCallback((): AbortSignal => {
    abortCurrent();
    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;
    return ctrl.signal;
  }, [abortCurrent]);

  // --- 选区（由 Editor 组件实时更新）---
  const selectionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const setSelectionRange = useCallback((range: { start: number; end: number } | null) => {
    selectionRangeRef.current = range;
  }, []);

  // ref 避免闭包陷阱
  const contentRef = useRef(content);
  contentRef.current = content;
  const draftContextStateRef = useRef<DraftContextState | undefined>(draftContextState);
  draftContextStateRef.current = draftContextState;

  // --- setContent ---
  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setError(null);
  }, []);

  // --- resetBlocks：切换章节时清空写作块记录 ---
  const resetBlocks = useCallback(() => {
    setWritingBlocks([]);
  }, []);

  // --- continueWriting：流式输出进 pendingContinuation，不写入正文 ---
  const continueWriting = useCallback(async (oneTimePrompt = '') => {
    if (!settings.apiKey) {
      setError('请先在设置（⚙️）中填入 Gemini API Key');
      return;
    }
    if (contentRef.current.trim().length < 50) {
      setError('请先输入至少50个字的内容，AI才能理解上下文');
      return;
    }

    setIsStreaming(true);
    setError(null);
    setIsTruncated(false);
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    setHasPendingContinuation(false);
    if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
    setAiInsertRange(null);

    try {
      const querySeed = `${contentRef.current.slice(-1200)}\n${oneTimePrompt}`;
      const memBudget = settings.memoryTokenBudget ?? 1500;
      const dynamicMemoryContext = resolveMemoryContext
        ? resolveMemoryContext(querySeed, memBudget)
        : memoryContext;

      const compacted = maybeCompactForContinue({
        content: contentRef.current,
        memoryContext: dynamicMemoryContext,
        oneTimePrompt,
        settings,
        state: draftContextStateRef.current,
      });
      if (onDraftContextStateChange) {
        onDraftContextStateChange(compacted.nextState);
      }

      const effectivePrevTail = settings.usePrevChapterContext ? prevChapterTail : '';
      const effectiveStyleBlock = settings.imitationMode ? styleBlock : '';
      const signal = newSignal();
      for await (const chunk of streamContinue(compacted.contentForPrompt, settings, oneTimePrompt, compacted.memoryContextForPrompt, effectivePrevTail, signal, undefined, effectiveStyleBlock)) {
        if (chunk.includes('⚠️ 内容因达到 Token 上限而截断')) {
          setIsTruncated(true);
          continue; // 不把警告文本加入内容
        }
        pendingContinuationRef.current += chunk;
        setPendingContinuation(prev => prev + chunk);
      }
      if (pendingContinuationRef.current.length > 0) {
        setHasPendingContinuation(true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return; // 用户主动取消，不报错
      setError(err instanceof Error ? err.message : '续写失败，请检查 API Key 或网络');
      setPendingContinuation('');
      pendingContinuationRef.current = '';
    } finally {
      setIsStreaming(false);
    }
  }, [settings, memoryContext, resolveMemoryContext, onDraftContextStateChange, prevChapterTail, newSignal]);

  // --- acceptContinuation：将待审核内容追加到正文，模块化写作时记录块 ---
  const acceptContinuation = useCallback(() => {
    const text = pendingContinuationRef.current;
    if (text) {
      const insertStart = contentRef.current.length;
      setContentState(prev => prev + text);
      setAiInsertRange({ start: insertStart, length: text.length });
      if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
      aiHighlightTimerRef.current = setTimeout(() => setAiInsertRange(null), 1500);

      // 模块化写作：记录此次 AI 块
      if (settings.modularWriting) {
        const prevBlocks = writingBlocksRef.current;
        const lastColorIdx = prevBlocks.length > 0
          ? prevBlocks[prevBlocks.length - 1].colorIndex
          : -1;
        const colorIndex = (lastColorIdx + 1) % BLOCK_COLORS_ARRAY.length;
        const newBlock: WritingBlock = {
          id: `blk_${Date.now()}`,
          start: insertStart,
          end: insertStart + text.length,
          colorIndex,
          generatedAt: Date.now(),
          styleProfileId: settings.imitationProfileId || undefined,
        };
        setWritingBlocks(prev => [...prev, newBlock]);
      }
    }
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    setHasPendingContinuation(false);
  }, [settings.modularWriting, settings.imitationProfileId]);

  // --- rejectContinuation：丢弃待审核续写 ---
  const rejectContinuation = useCallback(() => {
    abortCurrent();
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    setHasPendingContinuation(false);
    setIsTruncated(false);
  }, [abortCurrent]);

  // --- resumeWriting：从截断处接着写 ---
  const resumeWriting = useCallback(async () => {
    if (!settings.apiKey) return;
    setIsStreaming(true);
    setIsTruncated(false);
    const currentPending = pendingContinuationRef.current;
    const signal = newSignal();
    try {
      for await (const chunk of streamResume(contentRef.current, currentPending, settings, signal)) {
        pendingContinuationRef.current += chunk;
        setPendingContinuation(prev => prev + chunk);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '接着写失败，请重试');
    } finally {
      setIsStreaming(false);
    }
  }, [settings, newSignal]);

  // --- polish：润色选中部分（无选区则润色全文），结果进 pendingPolish ---
  const polish = useCallback(async (oneTimePrompt = '') => {
    if (!settings.apiKey) {
      setError('请先在设置（⚙️）中填入 Gemini API Key');
      return;
    }
    const full = contentRef.current;
    const sel = selectionRangeRef.current;
    // 确定要润色的文字范围
    const selStart = sel ? sel.start : 0;
    const selEnd   = sel ? sel.end   : full.length;
    const target   = full.slice(selStart, selEnd);

    if (target.trim().length < 10) {
      setError('选中内容太短，无法润色（至少需要 10 个字）');
      return;
    }

    setIsPolishing(true);
    setError(null);

    try {
      const querySeed = `${target}\n${oneTimePrompt}`;
      const dynamicMemoryContext = resolveMemoryContext
        ? resolveMemoryContext(querySeed, 1200)
        : memoryContext;
      const memoryContextForPrompt = buildMemoryContextWithCompact(dynamicMemoryContext, draftContextStateRef.current);
      const signal = newSignal();
      const polished = await polishText(target, settings, oneTimePrompt, memoryContextForPrompt, signal);
      setPendingPolish({ text: polished, selStart, selEnd });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '润色失败，请重试');
    } finally {
      setIsPolishing(false);
    }
  }, [settings, memoryContext, resolveMemoryContext, newSignal]);

  // --- acceptPolish：将润色结果替换到原始选区位置 ---
  const acceptPolish = useCallback(() => {
    if (pendingPolish !== null) {
      const { text, selStart, selEnd } = pendingPolish;
      const current = contentRef.current;
      // 验证索引仍然有效（用户可能在润色期间编辑了内容）
      if (selStart >= 0 && selEnd >= selStart && selEnd <= current.length) {
        setContentState(current.slice(0, selStart) + text + current.slice(selEnd));
      } else {
        // 索引失效：降级为追加到末尾
        setContentState(current + '\n' + text);
      }
    }
    setPendingPolish(null);
  }, [pendingPolish]);

  // --- rejectPolish：丢弃润色结果 ---
  const rejectPolish = useCallback(() => {
    abortCurrent();
    setPendingPolish(null);
  }, []);

  // --- generateVersions：并发生成 N 个续写版本供选择 ---
  const generateVersions = useCallback(async (oneTimePrompt = '') => {
    if (!settings.apiKey) {
      setError('请先在设置（⚙️）中填入 Gemini API Key');
      return;
    }
    if (contentRef.current.trim().length < 50) {
      setError('请先输入至少50个字的内容');
      return;
    }
    setIsGeneratingVersions(true);
    setError(null);
    setPendingVersions(null);
    const signal = newSignal();

    try {
      const querySeed = `${contentRef.current.slice(-1200)}\n${oneTimePrompt}`;
      const memBudget = settings.memoryTokenBudget ?? 1500;
      const dynamicMemoryContext = resolveMemoryContext
        ? resolveMemoryContext(querySeed, memBudget)
        : memoryContext;
      const compacted = maybeCompactForContinue({
        content: contentRef.current,
        memoryContext: dynamicMemoryContext,
        oneTimePrompt,
        settings,
        state: draftContextStateRef.current,
      });

      // 三个版本各有不同角度 + 不同创意度，确保内容有差异
      const VERSION_ANGLES = [
        '【情节推进型】重点推动外部事件，加入戏剧性冲突或转折，节奏明快',
        '【心理深挖型】重点展开主角内心独白与情感波动，细腻而富有层次',
        '【环境氛围型】重点渲染场景细节与感官描写，以环境折射人物状态',
      ];
      // 三个版本温度依次递增，保证差异度
      const BASE_TEMP = settings.creativity ?? 'balanced';
      const TEMP_OFFSETS: Record<string, number[]> = {
        precise:  [0.65, 0.78, 0.90],
        balanced: [0.75, 0.90, 1.05],
        creative: [0.88, 1.02, 1.18],
        wild:     [1.0,  1.15, 1.30],
      };
      const temps = TEMP_OFFSETS[BASE_TEMP] ?? TEMP_OFFSETS.balanced;

      const results = await Promise.all(
        VERSION_ANGLES.map(async (angle, i) => {
          const versionSettings = { ...settings, creativity: BASE_TEMP };
          // 通过临时修改 creativity 温度实现差异（在 streamContinue 里用 versionAngle 覆盖）
          // 直接传 versionAngle 参数，温度通过自定义字段注入
          const tempOverrideSettings = { ...versionSettings } as AppSettings & { _tempOverride?: number };
          tempOverrideSettings._tempOverride = temps[i];
          let text = '';
          for await (const chunk of streamContinue(
            compacted.contentForPrompt,
            tempOverrideSettings,
            oneTimePrompt,
            compacted.memoryContextForPrompt,
            prevChapterTail,
            signal,
            angle,
          )) {
            if (!chunk.includes('⚠️')) text += chunk;
          }
          return text.trim();
        })
      );
      setPendingVersions(results.filter(r => r.length > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成版本失败，请重试');
    } finally {
      setIsGeneratingVersions(false);
    }
  }, [settings, memoryContext, resolveMemoryContext, prevChapterTail]);

  // --- selectVersion：选择一个版本追加到正文 ---
  const selectVersion = useCallback((version: string) => {
    if (version) {
      const insertStart = contentRef.current.length;
      setContentState(prev => prev + version);
      setAiInsertRange({ start: insertStart, length: version.length });
      if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
      aiHighlightTimerRef.current = setTimeout(() => setAiInsertRange(null), 1500);
    }
    setPendingVersions(null);
  }, []);

  // --- dismissVersions：丢弃多版本结果 ---
  const dismissVersions = useCallback(() => {
    setPendingVersions(null);
  }, []);

  // --- insertAtCursor：在光标处插入文本 ---
  const insertAtCursor = useCallback((text: string) => {
    const sel = selectionRangeRef.current;
    const pos = sel ? sel.start : contentRef.current.length;
    const after = sel ? sel.end : pos;
    setContentState(contentRef.current.slice(0, pos) + text + contentRef.current.slice(after));
    setError(null);
  }, []);

  // --- clear（带快照 + 5 秒撤销）---
  const clear = useCallback(() => {
    clearSnapshotRef.current = contentRef.current;
    setContentState('');
    setError(null);
    setAiInsertRange(null);
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    setHasPendingContinuation(false);
    setPendingPolish(null);
    selectionRangeRef.current = null;
    setCanUndo(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setCanUndo(false), 5000);
  }, []);

  // --- undoClear ---
  const undoClear = useCallback(() => {
    setContentState(clearSnapshotRef.current);
    setCanUndo(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  // 清理定时器 + 取消进行中的请求
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    state: {
      content,
      isStreaming,
      isPolishing,
      error,
      canUndo,
      aiInsertRange,
      pendingContinuation,
      hasPendingContinuation,
      isTruncated,
      pendingPolish,
      pendingVersions,
      isGeneratingVersions,
      writingBlocks,
    },
    setContent,
    setSelectionRange,
    continueWriting,
    acceptContinuation,
    rejectContinuation,
    resumeWriting,
    polish,
    acceptPolish,
    rejectPolish,
    generateVersions,
    selectVersion,
    dismissVersions,
    clear,
    undoClear,
    insertAtCursor,
    resetBlocks,
  };
}
