// =============================================================
// components/CreateBookModal.tsx — 新建书目弹窗
// =============================================================

import { useState, useRef, useEffect } from 'react';

interface Props {
  onConfirm: (title: string, synopsis: string) => void;
  onCancel?: () => void;
  /** 是否为首次创建（隐藏取消按钮）*/
  isFirst?: boolean;
}

export function CreateBookModal({ onConfirm, onCancel, isFirst = false }: Props) {
  const [title, setTitle]     = useState('');
  const [synopsis, setSynopsis] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    const t = title.trim();
    if (!t) { inputRef.current?.focus(); return; }
    onConfirm(t, synopsis.trim());
  };

  const onBackdrop = (e: React.MouseEvent) => {
    if (!isFirst && e.target === e.currentTarget) onCancel?.();
  };

  return (
    <div className="modal-backdrop" onClick={onBackdrop}>
      <div className="create-book-modal">
        <div className="settings-header">
          <span className="settings-title">新建书目</span>
          {!isFirst && (
            <button className="modal-close" onClick={onCancel}>✕</button>
          )}
        </div>

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
      </div>
    </div>
  );
}
