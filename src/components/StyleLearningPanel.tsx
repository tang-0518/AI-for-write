// =============================================================
// components/StyleLearningPanel.tsx — 文风学习与管理面板
// =============================================================

import { useState, useMemo } from 'react';
import type { StyleProfile } from '../types/styleProfile';
import type { AnalysisStatus } from '../hooks/useStyleLearning';
import type { Draft } from '../hooks/useBooks';

interface StyleLearningPanelProps {
  profiles: StyleProfile[];
  status: AnalysisStatus;
  errorMsg: string;
  drafts: Draft[];                    // 当前书目的章节列表
  sourceBookId: string;
  activeProfileId: string;
  imitationMode: boolean;
  modularWriting: boolean;
  onCreateProfile: (params: {
    name: string;
    sourceBookId: string;
    chapters: { id: string; title: string; content: string }[];
  }) => void;
  onDeleteProfile: (id: string) => void;
  onRenameProfile: (id: string, name: string) => void;
  onSelectProfile: (id: string) => void;
  onToggleImitation: (on: boolean) => void;
  onToggleModular: (on: boolean) => void;
  onClose: () => void;
}

export function StyleLearningPanel({
  profiles,
  status,
  errorMsg,
  drafts,
  sourceBookId,
  activeProfileId,
  imitationMode,
  modularWriting,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
  onSelectProfile,
  onToggleImitation,
  onToggleModular,
  onClose,
}: StyleLearningPanelProps) {
  const [tab, setTab] = useState<'learn' | 'manage'>('learn');
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [profileName, setProfileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAnalyzing = status === 'analyzing';

  const toggleChapter = (id: string) => {
    setSelectedChapterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedChapterIds(new Set(drafts.map(d => d.id)));
  const clearAll  = () => setSelectedChapterIds(new Set());

  const handleAnalyze = () => {
    const chapters = drafts
      .filter(d => selectedChapterIds.has(d.id))
      .map(d => ({ id: d.id, title: d.title, content: d.content }));
    const name = profileName.trim() || `文风档案 ${new Date().toLocaleDateString('zh-CN')}`;
    onCreateProfile({ name, sourceBookId, chapters });
    setProfileName('');
  };

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  return (
    <div
      className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-panel"
        style={{ width: 'min(720px, 94vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">🎨 文风学习</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* 标签栏 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {(['learn', 'manage'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--purple-400)' : '2px solid transparent',
                color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                transition: 'color 0.15s',
              }}
            >
              {t === 'learn' ? '📖 学习文风' : '📂 管理档案'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── 学习标签 ── */}
          {tab === 'learn' && (
            <>
              {/* 档案命名 */}
              <div className="settings-row">
                <div className="settings-row-label"><span>档案名称</span></div>
                <input
                  type="text"
                  className="form-input"
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder={`文风档案 ${new Date().toLocaleDateString('zh-CN')}`}
                  maxLength={40}
                />
              </div>

              {/* 章节选择 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    选择参考章节（建议 3–8 章，覆盖不同情节类型）
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={selectAll}>全选</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={clearAll}>清空</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                  {drafts.map(d => (
                    <label
                      key={d.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 12px',
                        background: selectedChapterIds.has(d.id) ? 'rgba(var(--purple-rgb),0.08)' : 'var(--bg-input)',
                        border: `1px solid ${selectedChapterIds.has(d.id) ? 'rgba(var(--purple-rgb),0.3)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChapterIds.has(d.id)}
                        onChange={() => toggleChapter(d.id)}
                        style={{ accentColor: 'var(--purple-400)' }}
                      />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{d.title}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {d.content.replace(/\s/g, '').length.toLocaleString()} 字
                      </span>
                    </label>
                  ))}
                  {drafts.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>
                      当前书目暂无章节
                    </div>
                  )}
                </div>
              </div>

              {/* 错误提示 */}
              {errorMsg && (
                <div style={{ color: 'var(--error)', fontSize: 13, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(248,113,113,0.2)' }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              {/* 分析中进度 */}
              {isAnalyzing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--purple-400)', fontSize: 13 }}>
                  <div className="typing-dots"><span /><span /><span /></div>
                  AI 正在分析文风特征，请稍候…
                </div>
              )}

              {status === 'done' && (
                <div style={{ color: 'var(--success)', fontSize: 13 }}>✅ 文风档案已创建，可在「管理档案」中查看并激活</div>
              )}
            </>
          )}

          {/* ── 管理标签 ── */}
          {tab === 'manage' && (
            <>
              {/* 当前激活档案 */}
              <div style={{ padding: '12px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>当前激活档案</div>
                {activeProfile ? (
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--purple-400)' }}>
                    🎨 {activeProfile.name}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>未激活</div>
                )}

                {/* 开关 */}
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={imitationMode}
                      onChange={e => onToggleImitation(e.target.checked)}
                      disabled={!activeProfile}
                      style={{ accentColor: 'var(--purple-400)' }}
                    />
                    <span style={{ color: activeProfile ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      开启文风模仿
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={modularWriting}
                      onChange={e => onToggleModular(e.target.checked)}
                      style={{ accentColor: 'var(--purple-400)' }}
                    />
                    <span style={{ color: 'var(--text-primary)' }}>模块化写作着色</span>
                  </label>
                </div>
              </div>

              {/* 档案列表 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profiles.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>
                    还没有文风档案，去「学习文风」标签创建一个吧
                  </div>
                )}
                {profiles.map(p => (
                  <div
                    key={p.id}
                    style={{
                      border: `1px solid ${p.id === activeProfileId ? 'rgba(var(--purple-rgb),0.5)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: p.id === activeProfileId ? 'rgba(var(--purple-rgb),0.06)' : 'var(--bg-input)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* 档案头 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
                      {renamingId === p.id ? (
                        <input
                          type="text"
                          value={renameValue}
                          autoFocus
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => { onRenameProfile(p.id, renameValue); setRenamingId(null); }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { onRenameProfile(p.id, renameValue); setRenamingId(null); }
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-focus)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-primary)', fontSize: 13 }}
                          maxLength={40}
                        />
                      ) : (
                        <span
                          style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}
                          title="双击重命名"
                          onDoubleClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}
                        >
                          🎨 {p.name}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(p.analyzedAt).toLocaleDateString('zh-CN')}
                      </span>
                      {/* 展开/折叠 */}
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                      >
                        {expandedId === p.id ? '收起' : '详情'}
                      </button>
                      {/* 激活 */}
                      <button
                        className={`btn ${p.id === activeProfileId ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: 11, padding: '2px 10px' }}
                        onClick={() => onSelectProfile(p.id === activeProfileId ? '' : p.id)}
                      >
                        {p.id === activeProfileId ? '已激活' : '激活'}
                      </button>
                      {/* 删除 */}
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: '2px 8px', color: 'var(--error)' }}
                        onClick={() => { if (window.confirm(`删除「${p.name}」？`)) onDeleteProfile(p.id); }}
                      >
                        删除
                      </button>
                    </div>

                    {/* 展开内容：文风分析详情 + 仿写指令 */}
                    {expandedId === p.id && (
                      <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                          {[
                            ['句式', p.analysis.sentenceStyle],
                            ['对话', p.analysis.dialogueStyle],
                            ['描写', p.analysis.descriptionStyle],
                            ['视角', p.analysis.narrativePOV],
                            ['节奏', p.analysis.pacingStyle],
                            ['词汇', p.analysis.vocabularyStyle],
                            ['情感', p.analysis.emotionStyle],
                            ['规律', p.analysis.uniquePatterns],
                          ].map(([label, value]) => (
                            <div key={label} style={{ fontSize: 12 }}>
                              <span style={{ color: 'var(--text-muted)' }}>{label}：</span>
                              <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
                            </div>
                          ))}
                        </div>

                        <div style={{ fontSize: 12, marginTop: 4 }}>
                          <div style={{ color: 'var(--purple-400)', marginBottom: 4, fontWeight: 600 }}>仿写指令（注入续写 prompt）</div>
                          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                            {p.directive || '（暂无指令）'}
                          </div>
                        </div>

                        {p.exemplars.length > 0 && (
                          <div style={{ fontSize: 12 }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>参照范文</div>
                            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.9, background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'var(--font-content)', fontSize: 12 }}>
                              {p.exemplars[0]}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          {tab === 'learn' ? (
            <>
              <button className="btn btn-ghost" onClick={onClose}>取消</button>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={isAnalyzing || selectedChapterIds.size === 0}
              >
                {isAnalyzing ? '分析中…' : `分析选中 ${selectedChapterIds.size} 章`}
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={onClose}>关闭</button>
          )}
        </div>
      </div>
    </div>
  );
}
