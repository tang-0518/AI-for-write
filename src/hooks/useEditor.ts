// =============================================================
// hooks/useEditor.ts — 编辑器核心状态机
//
// 【职责】
//   管理编辑器的全部 AI 相关状态和操作。这是项目里最复杂的 Hook，
//   几乎所有 AI 功能（续写/润色/多版本/接着写）都在这里编排。
//
// 【设计思路：两阶段提交】
//   AI 输出不直接写入正文，而是先放入"待审核区"（pending state），
//   用户确认后再合并到正文。这样用户永远可以拒绝不满意的内容。
//
//   续写流程：continueWriting() → [流式输出] → pendingContinuation
//             acceptContinuation() → 追加到正文
//             rejectContinuation() → 丢弃
//
//   润色流程：polish() → [等待完整结果] → pendingPolish
//             acceptPolish() → 替换原始选区
//             rejectPolish() → 丢弃
//
//   多版本：generateVersions() → [并发3个请求] → pendingVersions[]
//            selectVersion(i) → 追加选中版本
//
// 【状态分组】
//   续写状态：pendingContinuation, hasPendingContinuation, isTruncated
//   润色状态：pendingPolish（含原始选区位置）
//   多版本：pendingVersions, isGeneratingVersions
//   加载状态：isStreaming, isPolishing
//   UI 辅助：error, canUndo, aiInsertRange（高亮新增文字）
//   模块化写作：writingBlocks（记录每块 AI 文字范围，用于着色）
//
// 【被哪些文件使用】
//   App.tsx — 在根组件中实例化，将返回值传递给子组件
//
// 【依赖的文件】
//   api/gemini.ts — streamContinue, streamResume, polishText
//   api/contextCompression.ts — maybeCompactForContinue, buildMemoryContextWithCompact
// =============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { streamContinue, streamResume, polishText, TRUNCATION_SENTINEL } from '../api/gemini';
import { BLOCK_COLORS } from '../config/constants';
import type { AppSettings, DraftContextState, WritingBlock, PolishMode } from '../types';
import { buildMemoryContextWithCompact, maybeCompactForContinue } from '../api/contextCompression';

export interface AiInsertRange {
  start: number;   // 新增文字在正文中的起始下标
  length: number;  // 新增文字的长度（用于计算高亮区域）
}

export const BLOCK_COLORS_ARRAY = BLOCK_COLORS;

// ── Hook 参数说明 ──────────────────────────────────────────────
// settings              — 全局设置（API Key、模型、写作风格等）
// initialContent        — 章节初始正文（切换章节时传入）
// memoryContext         — 静态记忆上下文（全量，不随查询变化）
// resolveMemoryContext  — 动态记忆检索函数（按查询词语义排序）；
//                         优先使用此函数，没有则 fallback 到 memoryContext
// draftContextState     — 当前章节的压缩状态（来自 useBooks）
// onDraftContextStateChange — 压缩状态更新后回调（由 useBooks 持久化）
// prevChapterTail       — 前章结尾文字（可注入续写上下文）
// styleBlock            — 文风模仿：格式化后的文风特征描述
export function useEditor(
  settings: AppSettings,
  initialContent: string = '',
  memoryContext = '',
  resolveMemoryContext?: (query: string, tokenBudget?: number) => string,
  draftContextState?: DraftContextState,
  onDraftContextStateChange?: (next: DraftContextState) => void,
  prevChapterTail = '',
  styleBlock = '',
  /** 场景感知胶囊上下文：传入当前文本尾段，返回相关角色的 prompt 片段 */
  capsuleContextFn?: (text: string) => string,
) {
  // ── 正文内容 ──────────────────────────────────────────────
  const [content, setContentState] = useState(initialContent);

  // ── 加载态 ────────────────────────────────────────────────
  const [isStreaming, setIsStreaming] = useState(false);    // 续写/接着写进行中
  const [isPolishing, setIsPolishing] = useState(false);   // 润色进行中
  const [error, setError] = useState<string | null>(null);

  // ── 撤销清空 ──────────────────────────────────────────────
  // clear() 清空正文时，在 5 秒内可以通过 undoClear() 恢复
  const [canUndo, setCanUndo] = useState(false);
  const clearSnapshotRef = useRef('');   // 保存清空前的正文快照
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── AI 高亮范围 ───────────────────────────────────────────
  // 接受续写/选择版本后，短暂高亮新增文字（1.5秒后自动消失）
  const [aiInsertRange, setAiInsertRange] = useState<AiInsertRange | null>(null);
  const aiHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 续写待审核状态 ────────────────────────────────────────
  // pendingContinuation：流式输出的累积文本（每个 SSE chunk 追加到这里）
  // hasPendingContinuation：是否有内容等待用户确认（控制"接受/拒绝"按钮显隐）
  // isTruncated：是否因 MAX_TOKENS 截断（显示"接着写"按钮）
  const [pendingContinuation, setPendingContinuation] = useState('');
  const pendingContinuationRef = useRef('');  // ref 版本，用于 for-await 循环内访问（避免闭包陷阱）
  const [hasPendingContinuation, setHasPendingContinuation] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  // ── 润色待审核状态 ────────────────────────────────────────
  // pendingPolish 同时存储润色后的文字 + 原始选区位置，
  // acceptPolish 时用选区位置精确替换原文
  const [pendingPolish, setPendingPolish] = useState<{ text: string; selStart: number; selEnd: number } | null>(null);

  // ── 多版本续写 ────────────────────────────────────────────
  // 并发生成3个风格各异的续写版本，交给用户选择
  const [pendingVersions, setPendingVersions] = useState<string[] | null>(null);
  const [isGeneratingVersions, setIsGeneratingVersions] = useState(false);

  // ── 模块化写作：写作块列表 ───────────────────────────────
  // 每次接受续写后，记录该段文字的范围和颜色索引，Editor 用于着色渲染
  const [writingBlocks, setWritingBlocks] = useState<WritingBlock[]>([]);
  const writingBlocksRef = useRef<WritingBlock[]>([]);
  writingBlocksRef.current = writingBlocks;

  // ── AbortController（取消进行中的 AI 请求）────────────────
  // 每次新的 AI 请求调用 newSignal() 时，会先 abort 旧的再创建新的，
  // 确保同时只有一个 AI 请求在进行
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortCurrent = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // 创建新的 AbortSignal，自动取消上一个请求
  const newSignal = useCallback((): AbortSignal => {
    abortCurrent();
    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;
    return ctrl.signal;
  }, [abortCurrent]);

  // ── 选区（由 Editor 组件实时更新）────────────────────────
  // 使用 ref 而非 state，避免选区变化触发不必要的重渲染
  const selectionRangeRef = useRef<{ start: number; end: number } | null>(null);
  const setSelectionRange = useCallback((range: { start: number; end: number } | null) => {
    selectionRangeRef.current = range;
  }, []);

  // ── 避免闭包陷阱：用 ref 同步最新值 ─────────────────────
  // useCallback 的依赖数组会捕获旧的 state 值；
  // 通过 ref 可以在任何时间点拿到最新的 content 和 draftContextState，
  // 而不需要把它们加入 useCallback 的依赖（加入会导致频繁重建回调）
  const contentRef = useRef(content);
  contentRef.current = content;
  const draftContextStateRef = useRef<DraftContextState | undefined>(draftContextState);
  draftContextStateRef.current = draftContextState;

  // capsuleContextFn 来自父组件，可能每次渲染都是新引用（内联函数）。
  // 改用 ref 持有最新版本，这样 continueWriting / polish / generateVersions
  // 不需要把 capsuleContextFn 放进 useCallback 依赖数组，避免频繁重建。
  const capsuleContextFnRef = useRef(capsuleContextFn);
  capsuleContextFnRef.current = capsuleContextFn;

  // ── setContent：供父组件从外部更新正文 ───────────────────
  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    setError(null);
  }, []);

  // ── resetBlocks：切换章节时清空写作块记录 ────────────────
  const resetBlocks = useCallback(() => {
    setWritingBlocks([]);
  }, []);

  // ── resetPendingState：切换章节时清除所有 AI 待审核状态 ──
  // 防止上一个章节的续写内容"泄漏"到新章节
  const resetPendingState = useCallback(() => {
    abortCurrent();
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    setHasPendingContinuation(false);
    setIsTruncated(false);
    setPendingPolish(null);
    setPendingVersions(null);
    setIsStreaming(false);
    setIsPolishing(false);
    setIsGeneratingVersions(false);
    setError(null);
    setAiInsertRange(null);
  }, [abortCurrent]);

  // ── continueWriting：AI 续写（流式输出进 pendingContinuation）──
  //
  // 流程：
  //   1. 检查前置条件（API Key、正文长度）
  //   2. 动态检索相关记忆（resolveMemoryContext）
  //   3. 判断是否需要压缩正文（maybeCompactForContinue）
  //   4. 调用 streamContinue() 获取 SSE 流
  //   5. 每个 chunk 追加到 pendingContinuation（渐进显示）
  //   6. 遇到 TRUNCATION_SENTINEL 表示 MAX_TOKENS 截断，显示"接着写"按钮
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
      // 用正文尾段 + 本次指令作为查询种子，检索最相关的记忆条目
      const querySeed = `${contentRef.current.slice(-1200)}\n${oneTimePrompt}`;
      const memBudget = settings.memoryTokenBudget ?? 1500;
      const dynamicMemoryContext = resolveMemoryContext
        ? resolveMemoryContext(querySeed, memBudget)
        : memoryContext;

      // 场景感知胶囊：检测正文尾段出现的角色，注入其胶囊 prompt（≤600 token）
      const fn = capsuleContextFnRef.current;
      const capsuleCtx = fn ? fn(contentRef.current.slice(-800)) : '';
      const combinedMemoryContext = capsuleCtx
        ? `${capsuleCtx}\n\n${dynamicMemoryContext}`
        : dynamicMemoryContext;

      // 判断是否需要压缩（正文过长时才触发）
      const compacted = maybeCompactForContinue({
        content: contentRef.current,
        memoryContext: combinedMemoryContext,
        oneTimePrompt,
        settings,
        state: draftContextStateRef.current,
      });
      // 将新的压缩状态回调给 App.tsx → useBooks，以持久化到 IndexedDB
      if (onDraftContextStateChange) {
        onDraftContextStateChange(compacted.nextState);
      }

      const effectivePrevTail = settings.usePrevChapterContext ? prevChapterTail : '';
      const effectiveStyleBlock = settings.imitationMode ? styleBlock : '';
      const signal = newSignal();

      // 遍历 SSE 流，每个文本 chunk 追加到 pendingContinuation
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
          // 特殊哨兵值，不是真实文本；表示 MAX_TOKENS 截断
          setIsTruncated(true);
          continue;
        }
        pendingContinuationRef.current += chunk;
        setPendingContinuation(prev => prev + chunk); // 函数式更新避免闭包旧值
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
  }, [settings, memoryContext, resolveMemoryContext, onDraftContextStateChange, prevChapterTail, newSignal, styleBlock]);

  // ── acceptContinuation：将待审核续写追加到正文 ────────────
  //
  // 额外副作用：
  //   - 若开启模块化写作，记录这段文字的颜色块信息
  //   - 触发 AI 高亮（1.5秒后自动消失）
  const acceptContinuation = useCallback(() => {
    const text = pendingContinuationRef.current;
    if (text) {
      const insertStart = contentRef.current.length;
      setContentState(prev => prev + text);
      setAiInsertRange({ start: insertStart, length: text.length });
      if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
      aiHighlightTimerRef.current = setTimeout(() => setAiInsertRange(null), 1500);

      // 模块化写作：为这段 AI 文字分配一个颜色块
      if (settings.modularWriting) {
        const prevBlocks = writingBlocksRef.current;
        const lastColorIdx = prevBlocks.length > 0
          ? prevBlocks[prevBlocks.length - 1].colorIndex
          : -1;
        const colorIndex = (lastColorIdx + 1) % BLOCK_COLORS_ARRAY.length; // 颜色循环
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

  // ── rejectContinuation：丢弃待审核续写 ───────────────────
  const rejectContinuation = useCallback(() => {
    abortCurrent(); // 如果还在流式输出中，立即中断
    setPendingContinuation('');
    pendingContinuationRef.current = '';
    setHasPendingContinuation(false);
    setIsTruncated(false);
  }, [abortCurrent]);

  // ── resumeWriting：从截断处接着写 ────────────────────────
  // 当 isTruncated=true 时，用户点击"接着写"触发此函数。
  // 策略：把"原文 + 已输出的截断部分"的末尾1800字发给 AI，让它无缝衔接
  const resumeWriting = useCallback(async () => {
    if (!settings.apiKey) return;
    setIsStreaming(true);
    setIsTruncated(false);
    const currentPending = pendingContinuationRef.current;
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '接着写失败，请重试');
    } finally {
      setIsStreaming(false);
    }
  }, [settings, newSignal]);

  // ── polish：润色选中文字（无选区则润色全文）──────────────
  //
  // 流程：
  //   1. 确定润色范围（selectionRange 或全文）
  //   2. 构建记忆上下文（含压缩摘要）
  //   3. 调用 polishText()（短文单次请求，长文分块串行）
  //   4. 结果存入 pendingPolish（同时记录原始选区位置，供 acceptPolish 替换）
  const polish = useCallback(async (oneTimePrompt = '', mode: PolishMode = 'standard') => {
    if (!settings.apiKey) {
      setError('请先在设置（⚙️）中填入 Gemini API Key');
      return;
    }
    const full = contentRef.current;
    const sel = selectionRangeRef.current;
    const selStart = sel ? sel.start : 0;
    const selEnd   = sel ? sel.end   : full.length;
    const target   = full.slice(selStart, selEnd);

    if (target.trim().length < 10) {
      setError('选中内容太短，无法操作（至少需要 10 个字）');
      return;
    }

    setIsPolishing(true);
    setError(null);

    try {
      // 用润色目标文字 + 指令检索相关记忆
      const querySeed = `${target}\n${oneTimePrompt}`;
      const dynamicMemoryContext = resolveMemoryContext
        ? resolveMemoryContext(querySeed, 1200)
        : memoryContext;
      // 场景感知胶囊：基于润色目标文字检测相关角色
      const capsuleCtx = capsuleContextFnRef.current ? capsuleContextFnRef.current(target.slice(-800)) : '';
      const combinedForPolish = capsuleCtx
        ? `${capsuleCtx}\n\n${dynamicMemoryContext}`
        : dynamicMemoryContext;
      // 润色需要附加压缩摘要（让 AI 了解全文背景）
      const memoryContextForPrompt = buildMemoryContextWithCompact(combinedForPolish, draftContextStateRef.current);
      const signal = newSignal();
      const polished = await polishText(target, settings, oneTimePrompt, memoryContextForPrompt, signal, mode);
      // 存储润色结果 + 原始选区（待用户确认后替换）
      setPendingPolish({ text: polished, selStart, selEnd });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '润色失败，请重试');
    } finally {
      setIsPolishing(false);
    }
  }, [settings, memoryContext, resolveMemoryContext, newSignal]);

  // ── acceptPolish：将润色结果替换到原始选区位置 ───────────
  //
  // 注意：用户在润色期间可能手动编辑了正文，导致选区位置失效。
  // 检测到失效时，降级为追加到末尾（而不是报错或丢弃结果）
  const acceptPolish = useCallback(() => {
    if (pendingPolish !== null) {
      const { text, selStart, selEnd } = pendingPolish;
      const current = contentRef.current;
      if (selStart >= 0 && selEnd >= selStart && selEnd <= current.length) {
        // 正常替换：切掉原始选区，插入润色后的文字
        setContentState(current.slice(0, selStart) + text + current.slice(selEnd));
      } else {
        // 降级：索引失效时追加到末尾
        setContentState(current + '\n' + text);
      }
    }
    setPendingPolish(null);
  }, [pendingPolish]);

  // ── rejectPolish：丢弃润色结果 ───────────────────────────
  const rejectPolish = useCallback(() => {
    abortCurrent();
    setPendingPolish(null);
  }, []);

  // ── generateVersions：并发生成 3 个续写版本供选择 ─────────
  //
  // 三个版本的差异化策略：
  //   - 不同的"写作角度"（versionAngle）注入 Prompt，引导 AI 各有侧重
  //   - 递增的 temperature 参数，确保内容分散度足够
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
      // 场景感知胶囊注入（同 continueWriting）
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

      // 3种写作角度，引导 AI 产生各有侧重的结果
      const VERSION_ANGLES = [
        '【情节推进型】重点推动外部事件，加入戏剧性冲突或转折，节奏明快',
        '【心理深挖型】重点展开主角内心独白与情感波动，细腻而富有层次',
        '【环境氛围型】重点渲染场景细节与感官描写，以环境折射人物状态',
      ];
      // 3个版本的温度依次递增，保证输出有明显差异
      const BASE_TEMP = settings.creativity ?? 'balanced';
      const TEMP_OFFSETS: Record<string, number[]> = {
        precise:  [0.65, 0.78, 0.90],
        balanced: [0.75, 0.90, 1.05],
        creative: [0.88, 1.02, 1.18],
        wild:     [1.0,  1.15, 1.30],
      };
      const temps = TEMP_OFFSETS[BASE_TEMP] ?? TEMP_OFFSETS.balanced;
      const effectiveStyleBlock = settings.imitationMode ? styleBlock : '';

      // 三个版本并发请求（Promise.all），减少等待时间
      const results = await Promise.all(
        VERSION_ANGLES.map(async (angle, i) => {
          // 通过 _tempOverride 私有字段覆盖 temperature（不修改 settings 原对象）
          const tempOverrideSettings = { ...settings } as AppSettings & { _tempOverride?: number };
          tempOverrideSettings._tempOverride = temps[i];
          let text = '';
          for await (const chunk of streamContinue(
            compacted.contentForPrompt,
            tempOverrideSettings,
            oneTimePrompt,
            compacted.memoryContextForPrompt,
            prevChapterTail,
            signal,
            angle,              // 写作角度注入
            effectiveStyleBlock,
          )) {
            if (chunk !== TRUNCATION_SENTINEL) text += chunk;
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
  }, [settings, memoryContext, resolveMemoryContext, prevChapterTail, styleBlock, newSignal]);

  // ── selectVersion：选择一个版本追加到正文 ────────────────
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

  // ── dismissVersions：丢弃多版本结果 ─────────────────────
  const dismissVersions = useCallback(() => {
    setPendingVersions(null);
  }, []);

  // ── insertAtCursor：在光标处插入文本（场景模板等使用）────
  const insertAtCursor = useCallback((text: string) => {
    const sel = selectionRangeRef.current;
    const pos = sel ? sel.start : contentRef.current.length;
    const after = sel ? sel.end : pos;
    setContentState(contentRef.current.slice(0, pos) + text + contentRef.current.slice(after));
    setError(null);
  }, []);

  // ── clear：清空正文（带5秒内可撤销保护）─────────────────
  // 先保存快照到 clearSnapshotRef，再清空；5秒后撤销窗口关闭
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

  // ── undoClear：撤销清空 ───────────────────────────────────
  const undoClear = useCallback(() => {
    setContentState(clearSnapshotRef.current);
    setCanUndo(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  // ── 清理副作用 ────────────────────────────────────────────
  // 组件卸载时：清除所有定时器，取消正在进行的 AI 请求
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (aiHighlightTimerRef.current) clearTimeout(aiHighlightTimerRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── 返回值结构 ────────────────────────────────────────────
  // state 对象：供组件读取的所有状态快照
  // 操作函数：供组件调用的业务逻辑（useCallback 包裹，引用稳定）
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
    resetPendingState,
  };
}
