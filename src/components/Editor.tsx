// =============================================================
// components/Editor.tsx — 核心编辑器（Ghost 文字 + 审核层）
// =============================================================

import { useEffect, useRef, useState } from 'react';
import type { AiInsertRange, BLOCK_COLORS_ARRAY } from '../hooks/useEditor';
import type { WritingBlock } from '../types';

interface PendingPolish {
  text: string;
  selStart: number;
  selEnd: number;
}

interface EditorProps {
  content: string;
  chapterTitle?: string;
  isStreaming: boolean;
  isPolishing: boolean;
  aiInsertRange: AiInsertRange | null;
  pendingContinuation?: string;
  hasPendingContinuation: boolean;
  pendingPolish: PendingPolish | null;
  focusRange?: { start: number; end: number } | null;
  fontSize?: number;
  editorFont?: string;
  writingBlocks?: WritingBlock[];
  onChange: (value: string) => void;
  onContinue: () => void;
  onAcceptContinuation: () => void;
  onRejectContinuation: () => void;
  onAcceptPolish: () => void;
  onRejectPolish: () => void;
  onSelectionChange: (range: { start: number; end: number } | null) => void;
}

// 与 useEditor.ts 中保持一致的颜色数组
const BLOCK_COLORS: readonly string[] = [
  'rgba(139,92,246,0.12)',
  'rgba(59,130,246,0.12)',
  'rgba(16,185,129,0.12)',
  'rgba(245,158,11,0.12)',
  'rgba(239,68,68,0.12)',
  'rgba(6,182,212,0.12)',
  'rgba(168,85,247,0.12)',
  'rgba(234,179,8,0.12)',
  'rgba(20,184,166,0.12)',
  'rgba(249,115,22,0.12)',
];

// 块颜色的边框色（更深一档）
const BLOCK_BORDER_COLORS: readonly string[] = [
  'rgba(139,92,246,0.35)',
  'rgba(59,130,246,0.35)',
  'rgba(16,185,129,0.35)',
  'rgba(245,158,11,0.35)',
  'rgba(239,68,68,0.35)',
  'rgba(6,182,212,0.35)',
  'rgba(168,85,247,0.35)',
  'rgba(234,179,8,0.35)',
  'rgba(20,184,166,0.35)',
  'rgba(249,115,22,0.35)',
];

// 将写作块转换为带颜色的 span 序列
function renderBlockLayer(content: string, blocks: WritingBlock[]): React.ReactNode {
  if (!blocks.length) return null;
  // 合并重叠块 → 逐字符确定颜色
  const colorMap = new Array<number | null>(content.length).fill(null);
  for (const blk of blocks) {
    const end = Math.min(blk.end, content.length);
    for (let i = blk.start; i < end; i++) colorMap[i] = blk.colorIndex;
  }

  // 生成 span 序列（连续同色合并）
  const spans: React.ReactNode[] = [];
  let i = 0;
  while (i < content.length) {
    const ci = colorMap[i];
    let j = i + 1;
    while (j < content.length && colorMap[j] === ci) j++;
    const seg = content.slice(i, j);
    if (ci !== null) {
      spans.push(
        <span
          key={i}
          style={{
            background: BLOCK_COLORS[ci % BLOCK_COLORS.length],
            borderBottom: `1px solid ${BLOCK_BORDER_COLORS[ci % BLOCK_BORDER_COLORS.length]}`,
          }}
        >
          {seg}
        </span>
      );
    } else {
      spans.push(<span key={i} style={{ color: 'transparent' }}>{seg}</span>);
    }
    i = j;
  }
  return <>{spans}</>;
}

// suppress unused import warning
void (null as unknown as typeof BLOCK_COLORS_ARRAY);

export function Editor({
  content,
  chapterTitle: _chapterTitle,
  isStreaming,
  isPolishing,
  aiInsertRange,
  pendingContinuation,
  hasPendingContinuation,
  pendingPolish,
  focusRange,
  fontSize,
  editorFont,
  writingBlocks = [],
  onChange,
  onContinue,
  onAcceptContinuation,
  onRejectContinuation,
  onAcceptPolish,
  onRejectPolish,
  onSelectionChange,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ghostOverlayRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const isProcessing = isStreaming || isPolishing;
  const hasPending = hasPendingContinuation || pendingPolish !== null;

  // 当前光标所在行（高亮用）
  const [activeLine, setActiveLine] = useState(0);

  // 流式输出时自动滚到底（textarea + ghost overlay 同步）
  useEffect(() => {
    const el = textareaRef.current;
    const overlay = ghostOverlayRef.current;
    if (el && isStreaming) {
      el.scrollTop = el.scrollHeight;
      if (overlay) overlay.scrollTop = overlay.scrollHeight;
    }
  }, [pendingContinuation, isStreaming]);

  // textarea 滚动时同步 ghost overlay + gutter
  useEffect(() => {
    const el = textareaRef.current;
    const overlay = ghostOverlayRef.current;
    const gutter = gutterRef.current;
    if (!el) return;
    const sync = () => {
      if (overlay) overlay.scrollTop = el.scrollTop;
      if (gutter) gutter.scrollTop = el.scrollTop;
    };
    el.addEventListener('scroll', sync);
    return () => el.removeEventListener('scroll', sync);
  }, []);

  // 查找替换：当 focusRange 变化时，定位光标并滚动到匹配处
  useEffect(() => {
    if (!focusRange) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(focusRange.start, focusRange.end);
    // 计算匹配行并滚动到可见区域
    const lineHeight = parseInt(getComputedStyle(el).lineHeight || '24', 10);
    const textBefore = el.value.slice(0, focusRange.start);
    const linesBefore = textBefore.split('\n').length - 1;
    const approxScrollTop = linesBefore * lineHeight - el.clientHeight / 2;
    el.scrollTop = Math.max(0, approxScrollTop);
  }, [focusRange]);

  // 全局键盘：Tab=接受，Esc=拒绝（仅在有待审核内容时生效）
  useEffect(() => {
    if (!hasPendingContinuation && pendingPolish === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (hasPendingContinuation) onAcceptContinuation();
        else if (pendingPolish !== null) onAcceptPolish();
      } else if (e.key === 'Escape') {
        if (hasPendingContinuation) onRejectContinuation();
        else if (pendingPolish !== null) onRejectPolish();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasPendingContinuation, pendingPolish, onAcceptContinuation, onRejectContinuation, onAcceptPolish, onRejectPolish]);

  // 追踪选区，通知 useEditor；同时更新当前行高亮
  const handleSelectionChange = () => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    onSelectionChange(s !== e ? { start: s, end: e } : null);
    // 计算光标所在行
    const lineIndex = el.value.slice(0, s).split('\n').length - 1;
    setActiveLine(lineIndex);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!isProcessing && !hasPending) onContinue();
    }
  };

  // AI 新内容接受后高亮覆盖层
  const renderHighlight = () => {
    if (!aiInsertRange) return null;
    const before = content.slice(0, aiInsertRange.start);
    const highlighted = content.slice(aiInsertRange.start, aiInsertRange.start + aiInsertRange.length);
    return (
      <div className="ai-highlight-overlay" aria-hidden>
        <span className="ai-highlight-before">{before}</span>
        <span className="ai-highlight-mark ai-highlight-visible">
          {highlighted}
        </span>
      </div>
    );
  };

  // Ghost 文字覆盖层（流式 + 待审核）
  const renderGhostOverlay = () => {
    if (!pendingContinuation) return null;
    return (
      <div className="ai-ghost-overlay" aria-hidden ref={ghostOverlayRef}>
        <span className="ghost-original">{content}</span>
        <span className="ghost-text">{pendingContinuation}</span>
      </div>
    );
  };

  // 续写审核栏
  const renderContinuationAuditBar = () => {
    if (!hasPendingContinuation) return null;
    return (
      <div className="audit-bar">
        <span className="audit-label">✨ AI 续写预览</span>
        <div className="audit-actions">
          <button className="audit-btn audit-accept" onClick={onAcceptContinuation}>
            ✅ 接受 <kbd>Tab</kbd>
          </button>
          <button className="audit-btn audit-reject" onClick={onRejectContinuation}>
            ✕ 拒绝 <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    );
  };

  // 润色审核面板
  const renderPolishPanel = () => {
    if (pendingPolish === null) return null;
    const { text, selStart, selEnd } = pendingPolish;
    const isPartial = selStart !== 0 || selEnd !== content.length;
    const originalText = content.slice(selStart, selEnd);
    const originalCount = originalText.replace(/\s/g, '').length;
    const polishedCount = text.replace(/\s/g, '').length;
    const delta = polishedCount - originalCount;
    return (
      <div className="polish-panel">
        <div className="polish-panel-header">
          <span className="audit-label">
            💎 {isPartial ? `润色选中内容` : '润色全文'}
            <span className="polish-delta">
              {originalCount} 字 → {polishedCount} 字
              {delta !== 0 && (
                <span className={delta > 0 ? 'delta-plus' : 'delta-minus'}>
                  {delta > 0 ? ` +${delta}` : ` ${delta}`}
                </span>
              )}
            </span>
          </span>
          <div className="audit-actions">
            <button className="audit-btn audit-accept" onClick={onAcceptPolish}>
              ✅ 接受 <kbd>Tab</kbd>
            </button>
            <button className="audit-btn audit-reject" onClick={onRejectPolish}>
              ✕ 拒绝 <kbd>Esc</kbd>
            </button>
          </div>
        </div>
        <div className="polish-panel-body">
          <div className="polish-col">
            <div className="polish-col-label">原文</div>
            <div className="polish-panel-content polish-original">{originalText}</div>
          </div>
          <div className="polish-divider" />
          <div className="polish-col">
            <div className="polish-col-label">润色后</div>
            <div className="polish-panel-content">{text}</div>
          </div>
        </div>
      </div>
    );
  };

  const lines = content.split('\n');

  const editorFontSize = fontSize ?? 17;

  // 润色面板叠加时给 textarea 留出底部空间，防止光标躲在面板下
  const polishBottomPad = pendingPolish !== null ? 'calc(min(44%, 320px) + 8px)' : undefined;

  return (
    <div
      className="editor-wrapper"
      style={{
      '--editor-font-size': `${editorFontSize}px`,
      '--editor-font-family': editorFont ?? "'Noto Serif SC', serif",
    } as React.CSSProperties}
    >
      {/* 行号 gutter */}
      <div className="editor-gutter" ref={gutterRef} aria-hidden>
        {lines.map((_, i) => (
          <div
            key={i}
            className={`editor-gutter-line${i === activeLine ? ' editor-gutter-line-active' : ''}`}
          >
            {i + 1}
          </div>
        ))}
        {lines.length === 0 && <div className="editor-gutter-line editor-gutter-line-active">1</div>}
      </div>

      {/* 编辑器主体（垂直排列） */}
      <div className="editor-main-col">
        {/* 处理中遮罩 */}
        {isProcessing && <div className="editor-overlay" />}

        {/* 模块化写作：块颜色层（始终渲染容器，避免条件挂载引发 removeChild 异常） */}
        <div
          className="ai-highlight-overlay block-color-layer"
          aria-hidden
          style={{ pointerEvents: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {writingBlocks.length > 0 ? renderBlockLayer(content, writingBlocks) : null}
        </div>

        {/* AI 接受后高亮 */}
        {renderHighlight()}

        {/* Ghost 文字（流式 + 待审核） */}
        {renderGhostOverlay()}

        <textarea
          ref={textareaRef}
          className={`editor-textarea ${isStreaming ? 'streaming' : ''}`}
          value={content}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onSelect={handleSelectionChange}
          onMouseUp={handleSelectionChange}
          placeholder="在这里开始你的故事..."
          disabled={isProcessing || hasPending}
          spellCheck={false}
          style={polishBottomPad ? { paddingBottom: polishBottomPad } : undefined}
        />

        {isStreaming && (
          <div className="typing-cursor-container">
            <span className="typing-cursor" />
          </div>
        )}

        {/* 续写审核栏 */}
        {renderContinuationAuditBar()}

        {/* 润色审核面板 */}
        {renderPolishPanel()}
      </div>
    </div>
  );
}
