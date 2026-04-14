// =============================================================
// components/CapsuleEditor.tsx — 角色胶囊编辑弹窗
// =============================================================

import { useState, useEffect } from 'react';
import type { CharacterCapsule, CapsuleCurrentState } from '../capsule/types';
import { CAPSULE_COLORS, DEFAULT_CAPSULE_STATE } from '../capsule/types';

interface CapsuleEditorProps {
  initial?: CharacterCapsule | null;  // null = 新建
  onSave:   (data: Omit<CharacterCapsule,
    'id' | 'createdAt' | 'updatedAt' | 'promptSnippet' | 'tokenEstimate' | 'bookId'
  > & { id?: string }) => Promise<void>;
  onClose:  () => void;
}

type FormState = {
  name:        string;
  color:       string;
  identity:    string;
  backstory:   string;
  personality: string;
  voice:       string;
  appearance:  string;
  currentState: CapsuleCurrentState;
  autoExtracted: boolean;
};

const BLANK_FORM: FormState = {
  name:         '',
  color:        CAPSULE_COLORS[0],
  identity:     '',
  backstory:    '',
  personality:  '',
  voice:        '',
  appearance:   '',
  currentState: { ...DEFAULT_CAPSULE_STATE },
  autoExtracted: false,
};

export function CapsuleEditor({ initial, onSave, onClose }: CapsuleEditorProps) {
  const [form, setForm]       = useState<FormState>(BLANK_FORM);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState<'basic' | 'state'>('basic');

  useEffect(() => {
    if (initial) {
      setForm({
        name:         initial.name,
        color:        initial.color,
        identity:     initial.identity,
        backstory:    initial.backstory,
        personality:  initial.personality,
        voice:        initial.voice,
        appearance:   initial.appearance,
        currentState: { ...DEFAULT_CAPSULE_STATE, ...initial.currentState },
        autoExtracted: initial.autoExtracted,
      });
    } else {
      setForm(BLANK_FORM);
    }
  }, [initial]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const setState = <K extends keyof CapsuleCurrentState>(key: K, val: CapsuleCurrentState[K]) =>
    setForm(f => ({ ...f, currentState: { ...f.currentState, [key]: val } }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...form, id: initial?.id });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ce-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ce-modal">
        {/* 标题栏 */}
        <div className="ce-header">
          <span className="ce-title">
            {initial ? `编辑胶囊：${initial.name}` : '新建角色胶囊'}
          </span>
          <button className="ce-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab 切换 */}
        <div className="ce-tabs">
          <button className={`ce-tab${tab === 'basic' ? ' active' : ''}`}
            onClick={() => setTab('basic')}>基本信息</button>
          <button className={`ce-tab${tab === 'state' ? ' active' : ''}`}
            onClick={() => setTab('state')}>当前状态</button>
        </div>

        <div className="ce-body">
          {tab === 'basic' && (
            <>
              {/* 角色名 + 颜色 */}
              <div className="ce-row">
                <div className="ce-field-wrap ce-field-name">
                  <label className="ce-label">角色名 *</label>
                  <input className="ce-input" placeholder="例：林晓"
                    value={form.name}
                    onChange={e => set('name', e.target.value)} />
                </div>
                <div className="ce-field-wrap ce-field-color">
                  <label className="ce-label">主题色</label>
                  <div className="ce-color-picker">
                    {CAPSULE_COLORS.map(c => (
                      <button key={c}
                        className={`ce-color-dot${form.color === c ? ' selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => set('color', c)} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="ce-field-wrap">
                <label className="ce-label">一句话身份</label>
                <input className="ce-input" placeholder="例：19岁冰系觉醒者，身世成谜"
                  value={form.identity}
                  onChange={e => set('identity', e.target.value)} />
              </div>

              <div className="ce-field-wrap">
                <label className="ce-label">性格特征</label>
                <textarea className="ce-textarea" rows={3}
                  placeholder="例：孤独隐忍，有爆发力，不轻易信任他人…"
                  value={form.personality}
                  onChange={e => set('personality', e.target.value)} />
              </div>

              <div className="ce-field-wrap">
                <label className="ce-label">说话风格</label>
                <textarea className="ce-textarea" rows={2}
                  placeholder="例：简短、隐晦，偶发狠话，不喜欢废话…"
                  value={form.voice}
                  onChange={e => set('voice', e.target.value)} />
              </div>

              <div className="ce-field-wrap">
                <label className="ce-label">外貌描述</label>
                <input className="ce-input" placeholder="外貌（可选）"
                  value={form.appearance}
                  onChange={e => set('appearance', e.target.value)} />
              </div>

              <div className="ce-field-wrap">
                <label className="ce-label">背景故事</label>
                <textarea className="ce-textarea" rows={4}
                  placeholder="详细背景故事，此处内容不会直接注入 AI prompt…"
                  value={form.backstory}
                  onChange={e => set('backstory', e.target.value)} />
              </div>
            </>
          )}

          {tab === 'state' && (
            <>
              <div className="ce-field-wrap">
                <label className="ce-label">所在章节</label>
                <input className="ce-input" type="number" min={0}
                  value={form.currentState.chapter}
                  onChange={e => setState('chapter', parseInt(e.target.value) || 0)} />
              </div>
              <div className="ce-field-wrap">
                <label className="ce-label">当前目标</label>
                <input className="ce-input" placeholder="例：找到父亲下落"
                  value={form.currentState.goal}
                  onChange={e => setState('goal', e.target.value)} />
              </div>
              <div className="ce-field-wrap">
                <label className="ce-label">情绪状态</label>
                <input className="ce-input" placeholder="例：压抑、愤怒、平静…"
                  value={form.currentState.mood}
                  onChange={e => setState('mood', e.target.value)} />
              </div>
              <div className="ce-field-wrap">
                <label className="ce-label">能力/状态</label>
                <input className="ce-input" placeholder="例：冰系第3阶，体力未恢复"
                  value={form.currentState.powerLevel}
                  onChange={e => setState('powerLevel', e.target.value)} />
              </div>
              <div className="ce-field-wrap">
                <label className="ce-label">已知关键信息</label>
                <textarea className="ce-textarea" rows={3}
                  placeholder="一行一条，角色已知的重要事实…"
                  value={form.currentState.knownFacts.join('\n')}
                  onChange={e => setState('knownFacts',
                    e.target.value.split('\n').filter(Boolean))} />
              </div>
              <div className="ce-field-wrap">
                <label className="ce-label">仍在隐瞒</label>
                <textarea className="ce-textarea" rows={3}
                  placeholder="一行一条，角色隐瞒的秘密…"
                  value={form.currentState.secrets.join('\n')}
                  onChange={e => setState('secrets',
                    e.target.value.split('\n').filter(Boolean))} />
              </div>
            </>
          )}
        </div>

        {/* 底部操作 */}
        <div className="ce-footer">
          <button className="ce-btn-cancel" onClick={onClose}>取消</button>
          <button className="ce-btn-save" onClick={handleSave}
            disabled={saving || !form.name.trim()}>
            {saving ? '保存中…' : '保存胶囊'}
          </button>
        </div>
      </div>
    </div>
  );
}
