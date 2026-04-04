// =============================================================
// components/InstructionBar.tsx — 快捷指令输入栏
// =============================================================

import { useRef, useEffect } from 'react';

interface InstructionBarProps {
  value: string;
  onChange: (v: string) => void;
}

export function InstructionBar({ value, onChange }: InstructionBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动撑高
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }, [value]);

  return (
    <div className="instruction-bar">
      <span className="instruction-icon" title="该指令将同时作用于续写和润色">💡</span>
      <textarea
        ref={textareaRef}
        className="instruction-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="输入对 AI 的额外指令，例如：禁止使用成语；保持第一人称叙事；增加更多对话细节…"
        rows={1}
        spellCheck={false}
      />
      {value && (
        <button
          className="instruction-clear"
          onClick={() => onChange('')}
          title="清除指令"
        >✕</button>
      )}
    </div>
  );
}
