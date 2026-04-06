// =============================================================
// components/InstructionBar.tsx — 快捷指令输入栏（含预设库）
// =============================================================

import { useRef, useEffect, useState } from 'react';
import type { PromptPreset } from '../types';
import { generateId } from '../utils/id';

interface InstructionBarProps {
  value: string;
  presets: PromptPreset[];
  onChange: (v: string) => void;
  onPresetsChange: (presets: PromptPreset[]) => void;
}

export function InstructionBar({ value, presets, onChange, onPresetsChange }: InstructionBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }, [value]);

  const handleSavePreset = () => {
    const name = saveName.trim() || `指令 ${presets.length + 1}`;
    if (!value.trim()) return;
    const newPreset: PromptPreset = {
      id: generateId(),
      name,
      prompt: value.trim(),
      createdAt: Date.now(),
    };
    onPresetsChange([...presets, newPreset]);
    setSaveName('');
    setShowSaveInput(false);
  };

  const handleDeletePreset = (id: string) => {
    onPresetsChange(presets.filter(p => p.id !== id));
  };

  const handleLoadPreset = (preset: PromptPreset) => {
    onChange(preset.prompt);
    setShowPresets(false);
  };

  return (
    <div className="instruction-bar">
      <span className="instruction-icon" title="该指令将注入到每次续写和润色的 Prompt 中">💡</span>
      <div className="instruction-main">
        <textarea
          ref={textareaRef}
          className="instruction-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="长期风格指令（注入每次 AI 请求）：例如「禁止使用成语；保持第一人称叙事；增加更多对话细节」"
          rows={1}
          spellCheck={false}
        />
        <div className="instruction-toolbar">
          {value.trim() && (
            <span className="instruction-active-badge" title="指令已激活，将注入到每次 AI 请求">
              ✦ 已激活
            </span>
          )}
          {value.trim() && (
            <button
              className="btn btn-ghost instruction-action-btn"
              title="保存为预设"
              onClick={() => setShowSaveInput(v => !v)}
            >
              💾 保存
            </button>
          )}
          <button
            className="btn btn-ghost instruction-action-btn"
            title={`预设库（${presets.length} 条）`}
            onClick={() => setShowPresets(v => !v)}
          >
            📚 预设{presets.length > 0 ? ` (${presets.length})` : ''}
          </button>
          {value && (
            <button
              className="instruction-clear"
              onClick={() => onChange('')}
              title="清除指令"
            >✕</button>
          )}
        </div>
      </div>

      {showSaveInput && (
        <div className="instruction-save-row">
          <input
            className="instruction-save-input"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="预设名称（可留空）"
            onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowSaveInput(false); }}
            autoFocus
          />
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={handleSavePreset}>保存</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => setShowSaveInput(false)}>取消</button>
        </div>
      )}

      {showPresets && (
        <div className="instruction-presets-panel">
          {presets.length === 0 ? (
            <div className="instruction-presets-empty">暂无预设。输入指令后点击「保存」添加。</div>
          ) : (
            presets.map(p => (
              <div key={p.id} className="instruction-preset-item">
                <div className="instruction-preset-content" onClick={() => handleLoadPreset(p)}>
                  <div className="instruction-preset-name">{p.name}</div>
                  <div className="instruction-preset-text">{p.prompt.slice(0, 60)}{p.prompt.length > 60 ? '…' : ''}</div>
                </div>
                <button
                  className="instruction-preset-delete"
                  onClick={() => handleDeletePreset(p.id)}
                  title="删除此预设"
                >✕</button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
