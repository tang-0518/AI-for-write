// =============================================================
// components/SettingsModal.tsx — IDE 风格设置面板
// =============================================================

import { useState } from 'react';
import type { AppSettings, WritingStyle, WriteLength } from '../types';
import { STYLE_CONFIGS, LENGTH_CONFIGS } from '../types';

type Category = 'connection' | 'writing' | 'prompt' | 'preferences' | 'context';

const NAV: { id: Category; icon: string; label: string }[] = [
  { id: 'connection',   icon: '⬡', label: '连接' },
  { id: 'writing',      icon: '✦', label: '写作风格' },
  { id: 'prompt',       icon: '◈', label: '提示词' },
  { id: 'preferences',  icon: '◎', label: '偏好' },
  { id: 'context',      icon: '⊞', label: '上下文策略' },
];

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [category, setCategory] = useState<Category>('connection');
  const [showKey, setShowKey] = useState(false);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  const handleSave = () => { onSave(draft); onClose(); };
  const onBackdrop  = (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div className="modal-backdrop" onClick={onBackdrop}>
      <div className="settings-panel">

        {/* ── 头部 ── */}
        <div className="settings-header">
          <span className="settings-title">设置</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* ── 主体：左导航 + 右内容 ── */}
        <div className="settings-body">

          {/* 左侧导航 */}
          <nav className="settings-nav">
            {NAV.map(n => (
              <button
                key={n.id}
                className={`settings-nav-item ${category === n.id ? 'settings-nav-active' : ''}`}
                onClick={() => setCategory(n.id)}
              >
                <span className="settings-nav-icon">{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </nav>

          {/* 右侧内容 */}
          <div className="settings-content">

            {/* ── 连接 ── */}
            {category === 'connection' && (
              <div className="settings-section">
                <div className="settings-section-title">API 连接</div>

                <div className="settings-row">
                  <div className="settings-row-label">
                    <span>Gemini API Key</span>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="settings-link">
                      获取 Key →
                    </a>
                  </div>
                  <div className="settings-row-desc">Key 仅保存在本地浏览器，不会上传任何服务器</div>
                  <div className="input-with-toggle">
                    <input
                      type={showKey ? 'text' : 'password'}
                      className="form-input"
                      value={draft.apiKey}
                      onChange={e => set('apiKey', e.target.value)}
                      placeholder="AIza..."
                      spellCheck={false}
                    />
                    <button className="toggle-visibility" onClick={() => setShowKey(v => !v)} type="button">
                      {showKey ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-row">
                  <div className="settings-row-label">
                    <span>模型</span>
                  </div>
                  <div className="settings-row-desc">推荐使用 gemini-2.5-pro，支持长文本与高质量输出</div>
                  <input
                    type="text"
                    className="form-input"
                    value={draft.model}
                    onChange={e => set('model', e.target.value)}
                    placeholder="gemini-2.5-pro"
                  />
                  <div className="settings-model-presets">
                    {['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'].map(m => (
                      <button
                        key={m}
                        className={`settings-preset ${draft.model === m ? 'settings-preset-active' : ''}`}
                        onClick={() => set('model', m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── 写作风格 ── */}
            {category === 'writing' && (
              <div className="settings-section">
                <div className="settings-section-title">写作风格</div>

                <div className="settings-row">
                  <div className="settings-row-label"><span>风格</span></div>
                  <div className="settings-row-desc">影响续写和润色的叙事腔调</div>
                  <div className="style-grid">
                    {(Object.entries(STYLE_CONFIGS) as [WritingStyle, typeof STYLE_CONFIGS[WritingStyle]][]).map(
                      ([key, cfg]) => (
                        <button
                          key={key}
                          className={`style-chip ${draft.style === key ? 'style-chip-active' : ''}`}
                          onClick={() => set('style', key)}
                          type="button"
                        >
                          <span>{cfg.emoji}</span>
                          <span>{cfg.label}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-row">
                  <div className="settings-row-label"><span>续写字数</span></div>
                  <div className="settings-row-desc">控制每次续写生成的大致篇幅</div>
                  <div className="length-grid">
                    {(Object.entries(LENGTH_CONFIGS) as [WriteLength, typeof LENGTH_CONFIGS[WriteLength]][]).map(
                      ([key, cfg]) => (
                        <button
                          key={key}
                          className={`length-chip ${draft.writeLength === key ? 'length-chip-active' : ''}`}
                          onClick={() => set('writeLength', key)}
                          type="button"
                        >
                          <span className="length-label">{cfg.label}</span>
                          <span className="length-hint">{cfg.hint}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── 提示词 ── */}
            {category === 'prompt' && (
              <div className="settings-section">
                <div className="settings-section-title">提示词</div>

                <div className="settings-row">
                  <div className="settings-row-label"><span>长期写作风格指令</span></div>
                  <div className="settings-row-desc">
                    始终生效，适合固定写作习惯，例如：禁止使用成语；保持第一人称；对话用书名号。
                    <br />也可通过工具栏「💡 指令」按钮快速编辑。
                  </div>
                  <textarea
                    className="form-input form-textarea"
                    value={draft.customPrompt}
                    onChange={e => set('customPrompt', e.target.value)}
                    placeholder="在这里填写长期生效的写作规则…"
                    rows={4}
                  />
                </div>

                <div className="settings-divider" />

                <div className="settings-row settings-row-info">
                  <span className="settings-info-icon">◈</span>
                  <div>
                    <div className="settings-info-title">本次指令（CommandBar）</div>
                    <div className="settings-row-desc">
                      编辑器底部的输入框用于每次操作的临时指令，用完即清，不在此处配置。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 偏好 ── */}
            {category === 'preferences' && (
              <div className="settings-section">
                <div className="settings-section-title">偏好</div>

                <div className="settings-row settings-row-inline">
                  <div>
                    <div className="settings-row-label"><span>自动保存草稿</span></div>
                    <div className="settings-row-desc">内容变化 500ms 后自动保存到本地浏览器</div>
                  </div>
                  <button
                    className={`toggle-switch ${draft.autoSave ? 'toggle-on' : ''}`}
                    onClick={() => set('autoSave', !draft.autoSave)}
                    type="button"
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>

                <div className="settings-divider" />

                <div className="settings-row settings-row-inline">
                  <div>
                    <div className="settings-row-label"><span>引用前章上下文</span></div>
                    <div className="settings-row-desc">续写时自动将前一章节的结尾片段作为背景参考，提高章节间连贯性</div>
                  </div>
                  <button
                    className={`toggle-switch ${draft.usePrevChapterContext ? 'toggle-on' : ''}`}
                    onClick={() => set('usePrevChapterContext', !draft.usePrevChapterContext)}
                    type="button"
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>

                <div className="settings-divider" />

                <div className="settings-row">
                  <div className="settings-row-label"><span>每章字数目标</span></div>
                  <div className="settings-row-desc">在状态栏显示写作进度条，填 0 则不显示</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '120px' }}
                      min={0}
                      step={500}
                      value={draft.wordGoal ?? 0}
                      onChange={e => set('wordGoal', Math.max(0, Number(e.target.value)))}
                      placeholder="0"
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>字</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1000, 2000, 3000, 5000].map(n => (
                        <button
                          key={n}
                          className={`settings-preset ${draft.wordGoal === n ? 'settings-preset-active' : ''}`}
                          onClick={() => set('wordGoal', n)}
                          type="button"
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 上下文策略 ── */}
            {category === 'context' && (
              <div className="settings-section">
                <div className="settings-section-title">上下文策略</div>

                <div className="settings-row">
                  <div className="settings-row-label"><span>压缩触发阈值</span></div>
                  <div className="settings-row-desc">
                    当估算输入 token 超过模型窗口的此比例时，自动压缩早期正文。<br />
                    值越低越保守（更早压缩），值越高越激进（更晚压缩）。
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="range"
                      min={0.5} max={0.95} step={0.05}
                      value={draft.compactTriggerRatio ?? 0.85}
                      onChange={e => set('compactTriggerRatio', Number(e.target.value))}
                      style={{ width: '140px' }}
                    />
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', minWidth: '36px' }}>
                      {Math.round((draft.compactTriggerRatio ?? 0.85) * 100)}%
                    </span>
                  </div>
                  <div className="settings-row-desc" style={{ marginTop: '4px' }}>
                    推荐值：75%（激进）/ 85%（默认）/ 95%（保守）
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-row">
                  <div className="settings-row-label"><span>记忆库 Token 预算</span></div>
                  <div className="settings-row-desc">
                    每次续写时注入到 Prompt 的记忆库最大 token 量。超出预算的低优先级记忆将以摘要形式注入。
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: '100px' }}
                      min={300} max={4000} step={100}
                      value={draft.memoryTokenBudget ?? 1500}
                      onChange={e => set('memoryTokenBudget', Math.max(300, Number(e.target.value)))}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>tokens</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[800, 1500, 2500].map(n => (
                        <button
                          key={n}
                          className={`settings-preset ${(draft.memoryTokenBudget ?? 1500) === n ? 'settings-preset-active' : ''}`}
                          onClick={() => set('memoryTokenBudget', n)}
                          type="button"
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-row settings-row-info">
                  <span className="settings-info-icon">⊞</span>
                  <div>
                    <div className="settings-info-title">压缩状态</div>
                    <div className="settings-row-desc">
                      压缩触发后，状态栏右侧显示「📦 ×N」徽章。<br />
                      连续失败 3 次触发熔断（显示⚠），可切换章节重置状态。
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── 底部按钮 ── */}
        <div className="settings-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}>保存设置</button>
        </div>

      </div>
    </div>
  );
}
