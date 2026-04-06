// =============================================================
// components/CreateBookModal.tsx — 新建书目 / TXT 导入 弹窗
// =============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { parseTxtBuffer, extractTitleFromFilename } from '../utils/txtImport';
import { ImportPreviewModal } from './ImportPreviewModal';
import type { ParseResult, ParsedChapter } from '../utils/txtImport';

interface Props {
  onConfirm: (title: string, synopsis: string) => void;
  onConfirmImport?: (bookTitle: string, chapters: ParsedChapter[]) => Promise<void>;
  onCancel?: () => void;
  /** 是否为首次创建（隐藏取消按钮）*/
  isFirst?: boolean;
}

export function CreateBookModal({ onConfirm, onConfirmImport, onCancel, isFirst = false }: Props) {
  const [mode, setMode] = useState<'manual' | 'import'>('manual');

  // ── 手动创建状态 ───────────────────────────────────────────
  const [title, setTitle]       = useState('');
  const [synopsis, setSynopsis] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'manual') inputRef.current?.focus();
  }, [mode]);

  const handleSubmit = () => {
    const t = title.trim();
    if (!t) { inputRef.current?.focus(); return; }
    onConfirm(t, synopsis.trim());
  };

  // ── 导入状态 ──────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState('');
  const [paragraphsPerChapter, setParagraphsPerChapter] = useState(5);
  const [showPreview, setShowPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const parseFile = useCallback(async (file: File) => {
    setImportFile(file);
    setParseError(null);
    setParseResult(null);
    setSuggestedTitle(extractTitleFromFilename(file.name));
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      // 异步让 UI 先渲染 loading 状态
      await new Promise(r => setTimeout(r, 0));
      const result = await parseTxtBuffer(buffer, paragraphsPerChapter);
      setParseResult(result);
    } catch {
      setParseError('文件解析失败，请确认是纯文本 .txt 文件。');
    } finally {
      setIsParsing(false);
    }
  }, [paragraphsPerChapter]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.txt') || file.type === 'text/plain')) {
      parseFile(file);
    } else {
      setParseError('请拖入 .txt 格式的纯文本文件。');
    }
  };

  const handleAdjust = useCallback(async (ppg: number) => {
    if (!importFile) return;
    setParagraphsPerChapter(ppg);
    setIsParsing(true);
    try {
      const buffer = await importFile.arrayBuffer();
      await new Promise(r => setTimeout(r, 0));
      const result = await parseTxtBuffer(buffer, ppg);
      setParseResult(result);
    } finally {
      setIsParsing(false);
    }
  }, [importFile]);

  const handleConfirmImport = async (bookTitle: string, chapters: ParsedChapter[]) => {
    if (!onConfirmImport) return;
    setIsImporting(true);
    try {
      await onConfirmImport(bookTitle, chapters);
      setShowPreview(false);
    } finally {
      setIsImporting(false);
    }
  };

  const onBackdrop = (e: React.MouseEvent) => {
    if (!isFirst && e.target === e.currentTarget) onCancel?.();
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onBackdrop}>
        <div className="create-book-modal">
          <div className="settings-header">
            <span className="settings-title">
              {mode === 'manual' ? '新建书目' : '导入小说'}
            </span>
            {!isFirst && (
              <button className="modal-close" onClick={onCancel}>✕</button>
            )}
          </div>

          {/* 模式切换 Tab */}
          <div style={{ display: 'flex', gap: 6, padding: '0 20px 0', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
            <button
              className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: '6px 6px 0 0', marginBottom: -1 }}
              onClick={() => setMode('manual')}
            >
              ✏️ 手动创建
            </button>
            {onConfirmImport && (
              <button
                className={`btn btn-sm ${mode === 'import' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: '6px 6px 0 0', marginBottom: -1 }}
                onClick={() => setMode('import')}
              >
                📄 从 TXT 导入
              </button>
            )}
          </div>

          {/* ── 手动创建模式 ── */}
          {mode === 'manual' && (
            <>
              <div className="create-book-body">
                <div className="settings-row">
                  <div className="settings-row-label">
                    <span>书名</span>
                    <span style={{ color: 'var(--accent)', fontSize: '12px' }}>必填</span>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    className="form-input"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                    placeholder="请输入书名…"
                    maxLength={60}
                  />
                </div>

                <div className="settings-row" style={{ marginTop: '16px' }}>
                  <div className="settings-row-label">
                    <span>简介</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>选填</span>
                  </div>
                  <textarea
                    className="form-input form-textarea"
                    value={synopsis}
                    onChange={e => setSynopsis(e.target.value)}
                    placeholder="一两句话描述故事背景或核心冲突（可留空）…"
                    rows={3}
                  />
                </div>
              </div>

              <div className="settings-footer">
                {!isFirst && (
                  <button className="btn btn-ghost" onClick={onCancel}>取消</button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!title.trim()}
                >
                  创建书目
                </button>
              </div>
            </>
          )}

          {/* ── 导入模式 ── */}
          {mode === 'import' && (
            <>
              <div className="create-book-body">
                {/* 拖拽/点击上传区 */}
                <div
                  style={{
                    border: `2px dashed ${isDragOver ? 'var(--purple-400)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '28px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                    background: isDragOver ? 'rgba(var(--purple-rgb),0.06)' : 'var(--bg-input)',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                  {importFile ? (
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                        {importFile.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {(importFile.size / 1024).toFixed(1)} KB · 点击重新选择
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                        拖入 TXT 文件或点击选择
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        支持 UTF-8 / GBK 编码
                      </div>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                </div>

                {/* 解析状态 */}
                {isParsing && (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                    <span className="btn-spinner" style={{ marginRight: 8 }} />
                    正在分析文件结构…
                  </div>
                )}

                {parseError && (
                  <div style={{
                    color: 'var(--error)',
                    fontSize: 13,
                    padding: '10px 14px',
                    background: 'rgba(248,113,113,0.08)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(248,113,113,0.2)',
                  }}>
                    {parseError}
                  </div>
                )}

                {parseResult && !isParsing && (
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(var(--purple-rgb),0.06)',
                    border: '1px solid rgba(var(--purple-rgb),0.2)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 13,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-primary)' }}>
                        识别到 <strong>{parseResult.chapters.length}</strong> 章 ·{' '}
                        <strong>{parseResult.totalChars.toLocaleString()}</strong> 字 ·{' '}
                        编码 {parseResult.encoding}
                      </span>
                      <span style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: parseResult.splitStrategy === 'chapter-marker'
                          ? 'rgba(74,222,128,0.15)' : 'rgba(245,158,11,0.15)',
                        color: parseResult.splitStrategy === 'chapter-marker'
                          ? 'var(--success)' : 'var(--gold-400)',
                      }}>
                        {parseResult.splitStrategy === 'chapter-marker' ? '✓ 章节标记' : '段落分章'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="settings-footer">
                {!isFirst && (
                  <button className="btn btn-ghost" onClick={onCancel}>取消</button>
                )}
                <button
                  className="btn btn-primary"
                  disabled={!parseResult || isParsing || isImporting}
                  onClick={() => setShowPreview(true)}
                >
                  {isImporting
                    ? <><span className="btn-spinner" />导入中…</>
                    : '查看并确认导入'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 导入预览弹窗 */}
      {showPreview && parseResult && (
        <ImportPreviewModal
          result={parseResult}
          suggestedTitle={suggestedTitle}
          paragraphsPerChapter={paragraphsPerChapter}
          onConfirm={handleConfirmImport}
          onAdjust={handleAdjust}
          onCancel={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
