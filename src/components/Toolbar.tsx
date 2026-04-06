// =============================================================
// components/Toolbar.tsx
// =============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { STYLE_CONFIGS, type WritingStyle } from '../types';
import type { Draft } from '../hooks/useBooks';
import type { Theme } from '../hooks/useTheme';

interface ToolbarProps {
  isProcessing: boolean;
  hasContent: boolean;
  content: string;
  allDrafts: Draft[];
  canUndo: boolean;
  currentStyle: WritingStyle;
  showInstruction: boolean;
  hasInstruction: boolean;
  memoryCount: number;
  currentTheme?: string;
  themes?: Theme[];
  onShowMemory: () => void;
  onShowStyleLearning?: () => void;
  onClear: () => void;
  onUndo: () => void;
  onOpenSettings: () => void;
  onStyleChange: (style: WritingStyle) => void;
  onToggleInstruction: () => void;
  onThemeChange?: (id: string) => void;
  imitationMode?: boolean;
  modularWriting?: boolean;
}

export function Toolbar({
  isProcessing,
  hasContent,
  content,
  allDrafts,
  canUndo,
  currentStyle,
  showInstruction,
  hasInstruction,
  memoryCount,
  currentTheme,
  themes,
  onShowMemory,
  onShowStyleLearning,
  onClear,
  onUndo,
  onOpenSettings,
  onStyleChange,
  onToggleInstruction,
  onThemeChange,
  imitationMode = false,
  modularWriting = false,
}: ToolbarProps) {
  const [copied, setCopied] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  const exportRef = useRef<HTMLDivElement>(null);
  const styleRef  = useRef<HTMLDivElement>(null);
  const themeRef  = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (styleRef.current  && !styleRef.current.contains(e.target as Node))  setStyleOpen(false);
      if (themeRef.current  && !themeRef.current.contains(e.target as Node))  setThemeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleExportTxt = useCallback(() => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `草稿_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [content]);

  const handleExportMd = useCallback(() => {
    const md = `# 小说草稿\n\n> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n---\n\n${content}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `草稿_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [content]);

  const handleExportAllTxt = useCallback(() => {
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
    const combined = allDrafts
      .map((d, i) => `【第${i + 1}章：${d.title}】\n\n${d.content}`)
      .join('\n\n' + '─'.repeat(30) + '\n\n');
    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `全书_${dateStr}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [allDrafts]);

  const handleExportAllMd = useCallback(() => {
    const dateStr = new Date().toLocaleString('zh-CN');
    const chapters = allDrafts
      .map((d, i) => `## 第${i + 1}章：${d.title}\n\n${d.content}`)
      .join('\n\n---\n\n');
    const md = `# 全书导出\n\n> 导出时间：${dateStr}  \n> 共 ${allDrafts.length} 章\n\n---\n\n${chapters}`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `全书_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }, [allDrafts]);

  const styleConfig = STYLE_CONFIGS[currentStyle];

  return (
    <header className="toolbar">
      {/* 品牌 */}
      <div className="toolbar-brand">
        <span className="brand-name">AI<span> for Write</span></span>
        <span className="brand-subtitle">v0.3 β</span>
      </div>

      <div className="toolbar-actions">
        {/* 风格切换 */}
        <div className="style-switcher" ref={styleRef}>
          <button
            className="btn btn-ghost style-switcher-btn"
            onClick={() => setStyleOpen(v => !v)}
            title="切换写作风格"
          >
            <span>{styleConfig.emoji}</span>
            <span className="btn-ghost-label">{styleConfig.label}</span>
            <span className="style-switcher-arrow">{styleOpen ? '▲' : '▼'}</span>
          </button>
          {styleOpen && (
            <div className="style-dropdown">
              {(Object.entries(STYLE_CONFIGS) as [WritingStyle, typeof STYLE_CONFIGS[WritingStyle]][]).map(
                ([key, cfg]) => (
                  <button
                    key={key}
                    className={`style-dropdown-item ${currentStyle === key ? 'style-dropdown-active' : ''}`}
                    onClick={() => { onStyleChange(key); setStyleOpen(false); }}
                  >
                    <span>{cfg.emoji}</span>
                    <span>{cfg.label}</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <div className="toolbar-divider" />

        {/* 记忆库 */}
        <button
          className="btn btn-ghost"
          onClick={onShowMemory}
          title="记忆库：存储人物、情节、写作风格等长期上下文"
        >
          <span>◈</span>
          <span className="btn-ghost-label">记忆{memoryCount > 0 ? ` ${memoryCount}` : ''}</span>
        </button>

        {/* 文风学习 */}
        {onShowStyleLearning && (
          <button
            className="btn btn-ghost"
            onClick={onShowStyleLearning}
            title="文风学习：分析导入小说的写作风格，开启模仿续写"
            style={imitationMode ? { color: 'var(--purple-400)', fontWeight: 600 } : undefined}
          >
            <span>🎨</span>
            <span className="btn-ghost-label">
              {imitationMode ? '仿写●' : '文风'}
              {modularWriting && !imitationMode ? '◈' : ''}
            </span>
          </button>
        )}

        {/* 全局指令 */}
        <button
          className={`btn btn-ghost ${showInstruction ? 'instruction-toggle-active' : ''} ${hasInstruction && !showInstruction ? 'instruction-toggle-has' : ''}`}
          onClick={onToggleInstruction}
          title="长期写作风格指令"
        >
          <span>💡</span>
          <span className="btn-ghost-label">指令{hasInstruction ? ' ●' : ''}</span>
        </button>

        <div className="toolbar-divider" />

        {/* 复制 */}
        <button
          className="btn btn-ghost"
          onClick={handleCopy}
          disabled={!hasContent}
          title="复制全文"
        >
          <span>{copied ? '✓' : '⎘'}</span>
          <span className="btn-ghost-label">{copied ? '已复制' : '复制'}</span>
        </button>

        {/* 导出下拉 */}
        <div className="export-dropdown" ref={exportRef}>
          <button
            className="btn btn-ghost"
            onClick={() => setExportOpen(v => !v)}
            disabled={!hasContent}
            title="导出文件"
          >
            <span>↓</span>
            <span className="btn-ghost-label">导出{exportOpen ? ' ▲' : ' ▼'}</span>
          </button>
          {exportOpen && (
            <div className="export-menu">
              <div className="export-menu-label" style={{padding:'6px 12px 2px'}}>当前章节</div>
              <button className="export-menu-item" onClick={handleExportTxt}>
                <span>📄</span>
                <span>纯文本 .txt</span>
              </button>
              <button className="export-menu-item" onClick={handleExportMd}>
                <span>📝</span>
                <span>Markdown .md</span>
              </button>
              {allDrafts.length > 1 && (
                <>
                  <div className="export-menu-divider" />
                  <div className="export-menu-label" style={{padding:'4px 12px 2px'}}>全书（{allDrafts.length} 章）</div>
                  <button className="export-menu-item" onClick={handleExportAllTxt}>
                    <span>📚</span>
                    <span>全书 .txt</span>
                  </button>
                  <button className="export-menu-item" onClick={handleExportAllMd}>
                    <span>📖</span>
                    <span>全书 .md</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="toolbar-divider" />

        {/* 撤销清空 */}
        {canUndo && (
          <button className="btn-undo" onClick={onUndo} title="撤销清空">
            <span>↩</span>
            <span>撤销 (5s)</span>
          </button>
        )}

        {/* 清空 */}
        <button
          className="btn btn-ghost btn-danger"
          onClick={onClear}
          disabled={isProcessing || !hasContent}
          title="清空内容"
        >
          <span>🗑</span>
          <span className="btn-ghost-label">清空</span>
        </button>

        {/* 主题 */}
        {themes && onThemeChange && (
          <div className="style-switcher" ref={themeRef}>
            <button
              className="btn btn-ghost style-switcher-btn"
              onClick={() => setThemeOpen(v => !v)}
              title="切换主题色"
            >
              <span>🎨</span>
              <span className="btn-ghost-label">{themes.find(t => t.id === currentTheme)?.label ?? '主题'}</span>
              <span className="style-switcher-arrow">{themeOpen ? '▲' : '▼'}</span>
            </button>
            {themeOpen && (
              <div className="style-dropdown">
                {themes.map(t => (
                  <button
                    key={t.id}
                    className={`style-dropdown-item ${currentTheme === t.id ? 'style-dropdown-active' : ''}`}
                    onClick={() => { onThemeChange(t.id); setThemeOpen(false); }}
                  >
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 设置 */}
        <button
          className="btn btn-ghost"
          onClick={onOpenSettings}
          title="设置"
        >
          <span>⚙</span>
          <span className="btn-ghost-label">设置</span>
        </button>
      </div>
    </header>
  );
}
