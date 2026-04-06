// =============================================================
// components/ImportPreviewModal.tsx — TXT 导入预览与确认弹窗
// =============================================================

import { useState } from 'react';
import type { ParseResult, ParsedChapter } from '../utils/txtImport';

interface ImportPreviewModalProps {
  result: ParseResult;
  suggestedTitle: string;
  paragraphsPerChapter: number;
  onConfirm: (bookTitle: string, chapters: ParsedChapter[]) => void;
  onAdjust: (paragraphsPerChapter: number) => void;
  onCancel: () => void;
}

export function ImportPreviewModal({
  result,
  suggestedTitle,
  paragraphsPerChapter,
  onConfirm,
  onAdjust,
  onCancel,
}: ImportPreviewModalProps) {
  const [bookTitle, setBookTitle] = useState(suggestedTitle);
  const [editedTitles, setEditedTitles] = useState<string[]>(
    () => result.chapters.map(c => c.title),
  );
  const [localPPG, setLocalPPG] = useState(paragraphsPerChapter);

  const handleAdjust = (val: number) => {
    setLocalPPG(val);
    onAdjust(val);
    // 重置标题编辑（新分章后标题变了）
    setEditedTitles(result.chapters.map(c => c.title));
  };

  const handleConfirm = () => {
    const t = bookTitle.trim();
    if (!t) return;
    const chapters: ParsedChapter[] = result.chapters.map((c, i) => ({
      ...c,
      title: (editedTitles[i] ?? c.title).trim() || c.title,
    }));
    onConfirm(t, chapters);
  };

  const totalWords = result.chapters.reduce((s, c) => s + c.wordCount, 0);

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div
        className="modal-panel"
        style={{ width: 'min(680px, 92vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">📄 导入预览</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              编码：{result.encoding} · 共 {totalWords.toLocaleString()} 字
            </span>
            <button className="modal-close" onClick={onCancel}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 书名 */}
          <div className="settings-row">
            <div className="settings-row-label">
              <span>书名</span>
              <span style={{ color: 'var(--accent)', fontSize: 12 }}>必填</span>
            </div>
            <input
              type="text"
              className="form-input"
              value={bookTitle}
              onChange={e => setBookTitle(e.target.value)}
              placeholder="请输入书名…"
              maxLength={60}
              autoFocus
            />
          </div>

          {/* 分章策略说明 */}
          {result.splitStrategy === 'paragraph-group' && (
            <div style={{
              background: 'rgba(var(--gold-rgb, 245,158,11),0.08)',
              border: '1px solid rgba(var(--gold-rgb, 245,158,11),0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: 13,
              color: 'var(--gold-400)',
            }}>
              ⚠️ 未检测到章节标记（如「第X章」），已按段落自动分章。可调整每章段落数：
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>每章段落数</span>
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={localPPG}
                  onChange={e => handleAdjust(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ width: 28, textAlign: 'center', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {localPPG}
                </span>
              </div>
            </div>
          )}

          {/* 章节列表 */}
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
              <span>共 <strong style={{ color: 'var(--text-primary)' }}>{result.chapters.length}</strong> 章</span>
              <span style={{ fontSize: 12 }}>点击章节名可编辑</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.chapters.map((ch, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 28, flexShrink: 0, textAlign: 'right' }}>
                    #{i + 1}
                  </span>
                  <input
                    type="text"
                    value={editedTitles[i] ?? ch.title}
                    onChange={e => setEditedTitles(prev => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-ui)',
                    }}
                    maxLength={60}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {ch.wordCount.toLocaleString()} 字
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!bookTitle.trim() || result.chapters.length === 0}
          >
            确认导入 {result.chapters.length} 章
          </button>
        </div>
      </div>
    </div>
  );
}
