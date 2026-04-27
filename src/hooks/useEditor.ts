import { useState, useCallback, useRef, useEffect } from 'react';
import {
  streamContinue,
  streamResume,
  polishText,
  rewriteParagraph,
  REWRITE_ANGLE_META,
  TRUNCATION_SENTINEL,
} from '../api/gemini';
import type { RewriteAngle } from '../api/gemini';
import { BLOCK_COLORS } from '../config/constants';
import type { AppSettings, DraftContextState, WritingBlock, PolishMode } from '../types';
import { buildMemoryContextWithCompact, maybeCompactForContinue } from '../api/contextCompression';
import { useNovelStore } from '../store/useNovelStore';

export interface AiInsertRange {
  start: number;
  length: number;
}

export const BLOCK_COLORS_ARRAY = BLOCK_COLORS;

type PendingPolish = {
  text: string;
  selStart: number;
  selEnd: number;
  mode: 'polish' | 'rewrite';
  label: string;
};

type SelectionRange = {
  start: number;
  end: number;
};

const AI_LOADING_LABEL = {
  continue: 'continue',
  polish: 'polish',
  rewrite: 'rewrite',
} as const;

export function useEditor(
  settings: AppSettings,
  initialContent = '',
  memoryContext = '',
  resolveMemoryContext?: (query: string, tokenBudget?: number) => string | Promise<string>,
  draftContextState?: DraftContextState,
  onDraftContextStateChange?: (next: DraftContextState) => void,
  prevChapterTail = '',
  styleBlock = '',
  capsuleContextFn?: (text: string) => string,
) {
  const [content, setContentState] = useState(initialContent);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [canUndo, setCanUndo] = useState(false);
  const clearSnapshotRef = useRef('');
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [aiInsertRange, setAiInsertRange] = useState<AiInsertRange | null>(null);
  const aiHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pendingContinuation, setPendingContinuation] = useState('');
  const pendingContinuationRef = useRef('');
  const [hasPendingContinuation, setHasPendingContinuation] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const continuationModelRef = useRef<string | null>(null);

  const [pendingPolish, setPendingPolish] = useState<PendingPolish | null>(null);

  const [pendingVersions, setPendingVersions] = useState<string[] | null>(null);
  const [isGeneratingVersions, setIsGeneratingVersions] = useState(false);

  const [writingBlocks, setWritingBlocks] = useState<WritingBlock[]>([]);
  const writingBlocksRef = useRef<WritingBlock[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const selectionRangeRef = useRef<SelectionRange | null>(null);
  const contentRef = useRef(content);
  const draftContextStateRef = useRef<DraftContextState | undefined>(draftContextState);
  const currentModelRef = useRef(settings.model);
  const capsuleContextFnRef = useRef(capsuleContextFn);

  useEffect(() => {
    writingBlocksRef.current = writingBlocks;
  }, [writingBlocks]);

  useEffect(() => {
    pendingContinuationRef.current = pendingContinuation;
  }, [pendingContinuation]);

  useEffect(() => {
    contentRef.current = content;
    const novelStore = useNovelStore.getState();
    novelStore.setCurrentContent(content);
    novelStore.setWordCount(content.replace(/\s/g, '').length);
  }, [content]);

  useEffect(() => {
    draftContextStateRef.current = draftContextState;
  }, [draftContextState]);

  useEffect(() => {
    capsuleContextFnRef.current = capsuleContextFn;
  }, [capsuleContextFn]);

  const setStoreAiLoading = useCallback((loading: boolean, label = '') => {
    useNovelStore.getState().setAiLoading(loading, label);
  }, []);

  const clearStoreAiSuggestion = useCallback(() => {
    useNovelStore.getState().setAiSuggestion('');
  }, []);

  const setStoreAiSuggestion = useCallback((text: string) => {
    useNovelStore.getState().setAiSuggestion(text);
  }, []);

  const abortCurrent = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const newSignal = useCallback((): AbortSignal => {
    abortCurrent();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller.signal;
  }, [abortCurrent]);

  const setSelectionRange = useCallback((range: SelectionRange | null) => {
    selectionRangeRef.current = range;
  }, []);

  const resolvePromptMemoryContext = useCallback(async (query: string, tokenBudget?: number) => {
    if (!resolveMemoryContext) return memoryContext;
    return await resolveMemoryContext(query, tokenBudget);
  }, [memoryContext, resolveMemoryContext]);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setError(null);
  }, []);

  const resetBlocks = useCallback(() => {
    setWritingBlocks([]);
  }, []);

  const resetPendingState = useCallback(() => {
    abortCurrent();
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    continuationModelRef.current = null;
    setHasPendingContinuation(false);
    setIsTruncated(false);
    setPendingPolish(null);
    setPendingVersions(null);
    setIsStreaming(false);
    setIsPolishing(false);
    setIsGeneratingVersions(false);
    setError(null);
    setAiInsertRange(null);
    clearStoreAiSuggestion();
    setStoreAiLoading(false);
  }, [abortCurrent, clearStoreAiSuggestion, setStoreAiLoading]);

  useEffect(() => {
    if (currentModelRef.current === settings.model) return;
    currentModelRef.current = settings.model;
    resetPendingState();
  }, [resetPendingState, settings.model]);

  const continueWriting = useCallback(async (oneTimePrompt = '') => {
    if (!settings.apiKey) {
      setError('请先在设置中填写 Gemini API Key');
      return;
    }
    if (contentRef.current.trim().length < 50) {
      setError('请先输入至少 50 个字的内容，AI 才能理解上下文');
      return;
    }

    setStoreAiLoading(true, AI_LOADING_LABEL.continue);
    clearStoreAiSuggestion();
    setIsStreaming(true);
    setError(null);
    setIsTruncated(false);
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    continuationModelRef.current = settings.model;
    setHasPendingContinuation(false);
    if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
    setAiInsertRange(null);

    try {
      const querySeed = `${contentRef.current.slice(-1200)}\n${oneTimePrompt}`;
      const memBudget = settings.memoryTokenBudget ?? 1500;
      const dynamicMemoryContext = await resolvePromptMemoryContext(querySeed, memBudget);

      const capsuleCtx = capsuleContextFnRef.current ? capsuleContextFnRef.current(contentRef.current.slice(-800)) : '';
      const combinedMemoryContext = capsuleCtx
        ? `${capsuleCtx}\n\n${dynamicMemoryContext}`
        : dynamicMemoryContext;

      const compacted = maybeCompactForContinue({
        content: contentRef.current,
        memoryContext: combinedMemoryContext,
        oneTimePrompt,
        settings,
        state: draftContextStateRef.current,
      });

      onDraftContextStateChange?.(compacted.nextState);

      const effectivePrevTail = settings.usePrevChapterContext ? prevChapterTail : '';
      const effectiveStyleBlock = settings.imitationMode ? styleBlock : '';
      const signal = newSignal();

      for await (const chunk of streamContinue(
        compacted.contentForPrompt,
        settings,
        oneTimePrompt,
        compacted.memoryContextForPrompt,
        effectivePrevTail,
        signal,
        undefined,
        effectiveStyleBlock,
      )) {
        if (chunk === TRUNCATION_SENTINEL) {
          setIsTruncated(true);
          continue;
        }

        pendingContinuationRef.current += chunk;
        setPendingContinuation(prev => prev + chunk);
      }

      if (pendingContinuationRef.current.length > 0) {
        setHasPendingContinuation(true);
        setStoreAiSuggestion(pendingContinuationRef.current);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '续写失败，请检查 API Key 或网络');
      setPendingContinuation('');
      pendingContinuationRef.current = '';
      continuationModelRef.current = null;
      clearStoreAiSuggestion();
    } finally {
      setIsStreaming(false);
      setStoreAiLoading(false);
    }
  }, [
    clearStoreAiSuggestion,
    newSignal,
    onDraftContextStateChange,
    prevChapterTail,
    resolvePromptMemoryContext,
    setStoreAiLoading,
    setStoreAiSuggestion,
    settings,
    styleBlock,
  ]);

  const acceptContinuation = useCallback(() => {
    const text = pendingContinuationRef.current;
    if (text) {
      const insertStart = contentRef.current.length;
      setContentState(prev => prev + text);
      setAiInsertRange({ start: insertStart, length: text.length });
      if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
      aiHighlightTimerRef.current = setTimeout(() => setAiInsertRange(null), 1500);

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
    continuationModelRef.current = null;
    setHasPendingContinuation(false);
    clearStoreAiSuggestion();
  }, [clearStoreAiSuggestion, settings.imitationProfileId, settings.modularWriting]);

  const rejectContinuation = useCallback(() => {
    abortCurrent();
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    continuationModelRef.current = null;
    setHasPendingContinuation(false);
    setIsTruncated(false);
    clearStoreAiSuggestion();
    setStoreAiLoading(false);
  }, [abortCurrent, clearStoreAiSuggestion, setStoreAiLoading]);

  const resumeWriting = useCallback(async () => {
    if (!settings.apiKey) return;
    if (continuationModelRef.current && continuationModelRef.current !== settings.model) {
      resetPendingState();
      setError('模型已切换，旧的续写草稿已清空，请重新点击“续写”生成');
      return;
    }

    setStoreAiLoading(true, AI_LOADING_LABEL.continue);
    setIsStreaming(true);
    setIsTruncated(false);
    const currentPending = pendingContinuationRef.current;
    continuationModelRef.current = settings.model;
    const signal = newSignal();

    try {
      for await (const chunk of streamResume(contentRef.current, currentPending, settings, signal)) {
        if (chunk === TRUNCATION_SENTINEL) {
          setIsTruncated(true);
          continue;
        }

        pendingContinuationRef.current += chunk;
        setPendingContinuation(prev => prev + chunk);
      }

      if (pendingContinuationRef.current.length > 0) {
        setStoreAiSuggestion(pendingContinuationRef.current);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '接着写失败，请重试');
      clearStoreAiSuggestion();
    } finally {
      setIsStreaming(false);
      setStoreAiLoading(false);
    }
  }, [
    clearStoreAiSuggestion,
    newSignal,
    resetPendingState,
    setStoreAiLoading,
    setStoreAiSuggestion,
    settings,
  ]);

  const polish = useCallback(async (oneTimePrompt = '', mode: PolishMode = 'standard') => {
    if (!settings.apiKey) {
      setError('请先在设置中填写 Gemini API Key');
      return;
    }

    const full = contentRef.current;
    const sel = selectionRangeRef.current;
    const selStart = sel ? sel.start : 0;
    const selEnd = sel ? sel.end : full.length;
    const target = full.slice(selStart, selEnd);

    if (target.trim().length < 10) {
      setError('选中内容太短，至少需要 10 个字');
      return;
    }

    setStoreAiLoading(true, AI_LOADING_LABEL.polish);
    clearStoreAiSuggestion();
    setIsPolishing(true);
    setError(null);

    try {
      const querySeed = `${target}\n${oneTimePrompt}`;
      const dynamicMemoryContext = await resolvePromptMemoryContext(querySeed, 1200);
      const capsuleCtx = capsuleContextFnRef.current ? capsuleContextFnRef.current(target.slice(-800)) : '';
      const combinedForPolish = capsuleCtx
        ? `${capsuleCtx}\n\n${dynamicMemoryContext}`
        : dynamicMemoryContext;
      const memoryContextForPrompt = buildMemoryContextWithCompact(
        combinedForPolish,
        draftContextStateRef.current,
      );
      const signal = newSignal();
      const polished = await polishText(target, settings, oneTimePrompt, memoryContextForPrompt, signal, mode);
      setPendingPolish({ text: polished, selStart, selEnd, mode: 'polish', label: '润色' });
      setStoreAiSuggestion(polished);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '润色失败，请重试');
      clearStoreAiSuggestion();
    } finally {
      setIsPolishing(false);
      setStoreAiLoading(false);
    }
  }, [
    clearStoreAiSuggestion,
    newSignal,
    resolvePromptMemoryContext,
    setStoreAiLoading,
    setStoreAiSuggestion,
    settings,
  ]);

  const rewriteSelection = useCallback(async (angle: RewriteAngle) => {
    if (!settings.apiKey) {
      setError('请先在设置中填写 Gemini API Key');
      return;
    }

    const full = contentRef.current;
    const sel = selectionRangeRef.current;
    const selStart = sel ? sel.start : 0;
    const selEnd = sel ? sel.end : 0;
    const target = full.slice(selStart, selEnd);

    if (target.trim().length < 10) {
      setError('请先选中至少 10 个字再执行重写');
      return;
    }

    setStoreAiLoading(true, AI_LOADING_LABEL.rewrite);
    clearStoreAiSuggestion();
    setIsPolishing(true);
    setError(null);

    try {
      const dynamicMemoryContext = await resolvePromptMemoryContext(target, 1200);
      const capsuleCtx = capsuleContextFnRef.current ? capsuleContextFnRef.current(target.slice(-800)) : '';
      const combinedForRewrite = capsuleCtx
        ? `${capsuleCtx}\n\n${dynamicMemoryContext}`
        : dynamicMemoryContext;
      const memoryContextForPrompt = buildMemoryContextWithCompact(
        combinedForRewrite,
        draftContextStateRef.current,
      );
      const signal = newSignal();
      if (signal.aborted) return;

      const rewritten = await rewriteParagraph(target, angle, settings, memoryContextForPrompt);
      if (!rewritten.trim()) {
        throw new Error('改写结果为空，请重试');
      }

      setPendingPolish({
        text: rewritten,
        selStart,
        selEnd,
        mode: 'rewrite',
        label: REWRITE_ANGLE_META[angle].label,
      });
      setStoreAiSuggestion(rewritten);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '改写失败，请重试');
      clearStoreAiSuggestion();
    } finally {
      setIsPolishing(false);
      setStoreAiLoading(false);
    }
  }, [
    clearStoreAiSuggestion,
    newSignal,
    resolvePromptMemoryContext,
    setStoreAiLoading,
    setStoreAiSuggestion,
    settings,
  ]);

  const acceptPolish = useCallback(() => {
    if (pendingPolish !== null) {
      const { text, selStart, selEnd } = pendingPolish;
      const current = contentRef.current;

      if (selStart >= 0 && selEnd >= selStart && selEnd <= current.length) {
        setContentState(current.slice(0, selStart) + text + current.slice(selEnd));
      } else {
        setContentState(current + '\n' + text);
      }
    }

    setPendingPolish(null);
    clearStoreAiSuggestion();
  }, [clearStoreAiSuggestion, pendingPolish]);

  const rejectPolish = useCallback(() => {
    abortCurrent();
    setPendingPolish(null);
    clearStoreAiSuggestion();
    setStoreAiLoading(false);
  }, [abortCurrent, clearStoreAiSuggestion, setStoreAiLoading]);

  const generateVersions = useCallback(async (oneTimePrompt = '') => {
    if (!settings.apiKey) {
      setError('请先在设置中填写 Gemini API Key');
      return;
    }
    if (contentRef.current.trim().length < 50) {
      setError('请先输入至少 50 个字的内容');
      return;
    }

    setIsGeneratingVersions(true);
    setError(null);
    setPendingVersions(null);
    const signal = newSignal();

    try {
      const querySeed = `${contentRef.current.slice(-1200)}\n${oneTimePrompt}`;
      const memBudget = settings.memoryTokenBudget ?? 1500;
      const dynamicMemoryContext = await resolvePromptMemoryContext(querySeed, memBudget);
      const capsuleCtx = capsuleContextFnRef.current ? capsuleContextFnRef.current(contentRef.current.slice(-800)) : '';
      const combinedMemoryContext = capsuleCtx
        ? `${capsuleCtx}\n\n${dynamicMemoryContext}`
        : dynamicMemoryContext;
      const compacted = maybeCompactForContinue({
        content: contentRef.current,
        memoryContext: combinedMemoryContext,
        oneTimePrompt,
        settings,
        state: draftContextStateRef.current,
      });

      const VERSION_ANGLES = [
        '【情节推进型】重点推动外部事件，加入戏剧性冲突或转折，节奏明快',
        '【心理深挖型】重点展开主角内心独白与情感波动，细腻而富有层次',
        '【环境氛围型】重点渲染场景细节与感官描写，以环境折射人物状态',
      ];

      const baseTemp = settings.creativity ?? 'balanced';
      const tempOffsets: Record<string, number[]> = {
        precise: [0.65, 0.78, 0.9],
        balanced: [0.75, 0.9, 1.05],
        creative: [0.88, 1.02, 1.18],
        wild: [1.0, 1.15, 1.3],
      };
      const temps = tempOffsets[baseTemp] ?? tempOffsets.balanced;
      const effectiveStyleBlock = settings.imitationMode ? styleBlock : '';

      const results = await Promise.all(
        VERSION_ANGLES.map(async (angle, index) => {
          const tempOverrideSettings = { ...settings } as AppSettings & { _tempOverride?: number };
          tempOverrideSettings._tempOverride = temps[index];

          let text = '';
          for await (const chunk of streamContinue(
            compacted.contentForPrompt,
            tempOverrideSettings,
            oneTimePrompt,
            compacted.memoryContextForPrompt,
            prevChapterTail,
            signal,
            angle,
            effectiveStyleBlock,
          )) {
            if (chunk !== TRUNCATION_SENTINEL) text += chunk;
          }

          return text.trim();
        }),
      );

      setPendingVersions(results.filter(result => result.length > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成版本失败，请重试');
    } finally {
      setIsGeneratingVersions(false);
    }
  }, [newSignal, prevChapterTail, resolvePromptMemoryContext, settings, styleBlock]);

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

  const dismissVersions = useCallback(() => {
    setPendingVersions(null);
  }, []);

  const insertAtCursor = useCallback((text: string) => {
    const sel = selectionRangeRef.current;
    const start = sel ? sel.start : contentRef.current.length;
    const end = sel ? sel.end : start;
    setContentState(contentRef.current.slice(0, start) + text + contentRef.current.slice(end));
    setError(null);
  }, []);

  const clear = useCallback(() => {
    clearSnapshotRef.current = contentRef.current;
    setContentState('');
    setError(null);
    setAiInsertRange(null);
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    continuationModelRef.current = null;
    setHasPendingContinuation(false);
    setPendingPolish(null);
    selectionRangeRef.current = null;
    setCanUndo(true);
    clearStoreAiSuggestion();
    setStoreAiLoading(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setCanUndo(false), 5000);
  }, [clearStoreAiSuggestion, setStoreAiLoading]);

  const undoClear = useCallback(() => {
    setContentState(clearSnapshotRef.current);
    setCanUndo(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

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
    rewriteSelection,
    acceptPolish,
    rejectPolish,
    generateVersions,
    selectVersion,
    dismissVersions,
    clear,
    undoClear,
    insertAtCursor,
    resetBlocks,
    resetPendingState,
  };
}
