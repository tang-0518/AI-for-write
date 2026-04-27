// =============================================================
// components/CharacterPanel.tsx — 统一角色管理面板（KG + 胶囊合并）
//
// 【数据来源】
//   左侧列表：knowledge graph NovelEntity（type=character）
//   右侧详情·属性/关系 tab：KG entity 的 attributes + relations
//   右侧详情·场景注入 tab：对应 CharacterCapsule（通过 name 匹配）
//
// 【合并原则】
//   KG entity = 结构化正本（外貌/属性/关系/事实）
//   Capsule   = 写作上下文层（声音/当前状态/promptSnippet）
//   两者通过角色名关联，并列展示，不合并存储。
// =============================================================

import { useState, useMemo, useEffect } from 'react';
import { useNovelGraph } from '../hooks/useNovelGraph';
import type { NovelEntity, NovelRelation } from '../hooks/useNovelGraph';
import type { CharacterCapsule } from '../capsule/types';

interface CharacterPanelProps {
  bookId:           string | null;
  capsules?:        CharacterCapsule[];
  onClose:          () => void;
  onInjectContext?: (snippet: string) => void;
  onViewGraph?:     () => void;
  onEditCapsule?:   (name: string) => void;           // 已废弃，保留兼容
  highlightName?:   string;
  // 胶囊 CRUD（合并后直接在面板内操作）
  onCreateCapsule?: (name: string, partial?: Partial<CharacterCapsule>) => Promise<CharacterCapsule>;
  onUpdateCapsule?: (id: string, patch: Partial<CharacterCapsule>) => Promise<CharacterCapsule>;
  onDeleteCapsule?: (id: string) => Promise<void>;
}

// ── 常量 ──────────────────────────────────────────────────────
const APPEARANCE_KEYS = ['外貌', '外形', '身高', '体型', '发色', '发型', '瞳色', '肤色', '年龄', '性别', '服装', '特征'];
const PERSONALITY_KEYS = ['性格', '特质', '习惯', '口头禅', '弱点', '能力', '金手指', '阵营', '目标', '底线', '弧线'];

function classifyAttr(key: string): 'appearance' | 'personality' | 'other' {
  if (APPEARANCE_KEYS.some(k => key.includes(k))) return 'appearance';
  if (PERSONALITY_KEYS.some(k => key.includes(k))) return 'personality';
  return 'other';
}

// ── 子组件：属性行 ────────────────────────────────────────────
function AttrRow({ attrKey, value, onRemove }: { attrKey: string; value: string; onRemove: (k: string) => void }) {
  return (
    <div className="char-attr-row">
      <span className="char-attr-key">{attrKey}</span>
      <span className="char-attr-val">{value}</span>
      <button className="char-attr-del" onClick={() => onRemove(attrKey)} title="删除">×</button>
    </div>
  );
}

// ── 子组件：观察事实行 ────────────────────────────────────────
function ObsRow({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <div className="char-obs-row">
      <span className="char-obs-dot">·</span>
      <span className="char-obs-text">{text}</span>
      <button className="char-attr-del" onClick={onRemove} title="删除">×</button>
    </div>
  );
}

// ── 子组件：关系行 ────────────────────────────────────────────
function RelRow({ rel, selfName, entities }: { rel: NovelRelation; selfName: string; entities: NovelEntity[] }) {
  const isFrom   = rel.from === selfName;
  const other    = entities.find(e => e.name === (isFrom ? rel.to : rel.from));
  const typeColor: Record<string, string> = {
    character: '#f87171', faction: '#f472b6', item: '#fbbf24',
    location: '#60a5fa', event: '#c084fc', world_rule: '#34d399', plot_hook: '#fb923c',
  };
  return (
    <div className="char-rel-row">
      <span className="char-rel-arrow" style={{ color: isFrom ? '#a78bfa' : '#60a5fa' }}>
        {isFrom ? '→' : '←'}
      </span>
      <span className="char-rel-other" style={{ color: other ? (typeColor[other.type] ?? '#aaa') : '#aaa' }}>
        {isFrom ? rel.to : rel.from}
      </span>
      <span className="char-rel-type">[{rel.relationType}]</span>
      {rel.chapter != null && <span className="char-rel-ch">第{rel.chapter}章</span>}
    </div>
  );
}

// ── 子组件：胶囊编辑 tab（合并查看+编辑） ────────────────────
interface CapsuleEditTabProps {
  capsule:        CharacterCapsule | null;
  characterName:  string;
  editing:        boolean;
  draft:          Partial<CharacterCapsule>;
  saving:         boolean;
  canEdit:        boolean;
  onInject?:      (s: string) => void;
  onStartEdit:    () => void;
  onCancelEdit:   () => void;
  onDraftChange:  (patch: Partial<CharacterCapsule>) => void;
  onSave:         () => Promise<void>;
  onDelete?:      () => Promise<void>;
}

function CapsuleEditTab({
  capsule, characterName, editing, draft, saving, canEdit,
  onInject, onStartEdit, onCancelEdit, onDraftChange, onSave, onDelete,
}: CapsuleEditTabProps) {
  const [copied, setCopied] = useState(false);

  const handleInject = () => {
    const snippet = capsule?.promptSnippet?.trim();
    if (onInject && snippet) {
      onInject(`\n[角色上下文·${characterName}]\n${snippet}\n`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  if (!capsule && !editing) {
    return (
      <div className="char-scene-empty">
        <div style={{ fontSize: 28, marginBottom: 6 }}>🧩</div>
        <div>此角色还没有胶囊</div>
        {canEdit && (
          <button className="char-scene-create-btn" onClick={onStartEdit} style={{ marginTop: 10 }}>
            + 创建胶囊
          </button>
        )}
      </div>
    );
  }

  if (editing) {
    const d = draft;
    return (
      <div className="char-capsule-edit">
        <div className="char-capsule-edit-row">
          <label>一句话身份</label>
          <input value={d.identity ?? ''} onChange={e => onDraftChange({ identity: e.target.value })} placeholder="19岁，冰系觉醒者，身世成谜" />
        </div>
        <div className="char-capsule-edit-row">
          <label>性格特征</label>
          <textarea rows={2} value={d.personality ?? ''} onChange={e => onDraftChange({ personality: e.target.value })} placeholder="外冷内热，执拗，不善言辞…" />
        </div>
        <div className="char-capsule-edit-row">
          <label>说话风格</label>
          <textarea rows={2} value={d.voice ?? ''} onChange={e => onDraftChange({ voice: e.target.value })} placeholder="简短、直接，少用感叹词…" />
        </div>
        <div className="char-capsule-edit-row">
          <label>外貌描述</label>
          <textarea rows={2} value={d.appearance ?? ''} onChange={e => onDraftChange({ appearance: e.target.value })} placeholder="银发、蓝眸…" />
        </div>
        <div className="char-capsule-edit-row">
          <label>当前目标</label>
          <input value={d.currentState?.goal ?? ''} onChange={e => onDraftChange({ currentState: { ...(d.currentState ?? {}), goal: e.target.value } as CharacterCapsule['currentState'] })} placeholder="找到身世真相" />
        </div>
        <div className="char-capsule-edit-row">
          <label>情绪状态</label>
          <input value={d.currentState?.mood ?? ''} onChange={e => onDraftChange({ currentState: { ...(d.currentState ?? {}), mood: e.target.value } as CharacterCapsule['currentState'] })} placeholder="平静 / 压抑 / 崩溃…" />
        </div>
        <div className="char-capsule-edit-actions">
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={onSave} disabled={saving}>
            {saving ? '保存中…' : '✓ 保存'}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={onCancelEdit}>取消</button>
          {onDelete && (
            <button className="btn btn-ghost" style={{ fontSize: 11, color: '#f87171', marginLeft: 'auto' }} onClick={onDelete}>
              删除胶囊
            </button>
          )}
        </div>
      </div>
    );
  }

  // 查看模式
  const state = capsule!.currentState;
  const snippet = capsule!.promptSnippet?.trim() || '';
  return (
    <div className="char-scene-body">
      {capsule!.identity && (
        <div className="char-scene-identity">
          <span className="char-scene-label">身份</span>
          <span>{capsule!.identity}</span>
        </div>
      )}
      {(capsule!.personality || capsule!.voice) && (
        <div className="char-section">
          <div className="char-section-title">性格 &amp; 声音</div>
          {capsule!.personality && <div className="char-scene-text">{capsule!.personality}</div>}
          {capsule!.voice && (
            <div className="char-scene-voice">
              <span className="char-scene-label">说话风格</span>
              {capsule!.voice}
            </div>
          )}
        </div>
      )}
      {state && (state.goal || state.mood || state.powerLevel) && (
        <div className="char-section">
          <div className="char-section-title">
            当前状态
            {state.chapter > 0 && <span style={{ fontWeight: 400, opacity: 0.5, marginLeft: 4 }}>（第{state.chapter}章）</span>}
          </div>
          {state.goal && <div className="char-state-row"><span className="char-state-key">目标</span>{state.goal}</div>}
          {state.mood && <div className="char-state-row"><span className="char-state-key">情绪</span>{state.mood}</div>}
          {state.powerLevel && <div className="char-state-row"><span className="char-state-key">能力</span>{state.powerLevel}</div>}
        </div>
      )}
      {snippet && (
        <div className="char-section">
          <div className="char-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            注入片段 <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 400 }}>~{capsule!.tokenEstimate ?? 0} token</span>
          </div>
          <div className="char-snippet-box">{snippet}</div>
          <button className="btn btn-primary" style={{ fontSize: 11, marginTop: 6, width: '100%' }} onClick={handleInject} disabled={!onInject}>
            {copied ? '✓ 已插入' : '→ 插入写作区'}
          </button>
        </div>
      )}
      {canEdit && (
        <button className="btn btn-ghost" style={{ fontSize: 11, marginTop: 8, width: '100%' }} onClick={onStartEdit}>
          ✏ 编辑胶囊
        </button>
      )}
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────────
export default function CharacterPanel({
  bookId, capsules = [], onClose, onInjectContext, onViewGraph, highlightName,
  onCreateCapsule, onUpdateCapsule, onDeleteCapsule,
}: CharacterPanelProps) {
  const {
    graph, loading, error,
    addEntity, removeEntity, loadGraph,
  } = useNovelGraph(bookId);

  type DetailTab = 'attrs' | 'scene';

  const [search,      setSearch]      = useState('');
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [detailTab,   setDetailTab]   = useState<DetailTab>('attrs');

  // 胶囊内联编辑状态
  const [editingCapsule, setEditingCapsule] = useState(false);
  const [capsuleDraft,   setCapsuleDraft]   = useState<Partial<CharacterCapsule>>({});
  const [savingCapsule,  setSavingCapsule]  = useState(false);

  // 新增角色
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [isCreating,  setIsCreating]  = useState(false);

  // 新增属性
  const [showAddAttr, setShowAddAttr] = useState(false);
  const [newAttrKey,  setNewAttrKey]  = useState('');
  const [newAttrVal,  setNewAttrVal]  = useState('');

  // 新增观察
  const [showAddObs, setShowAddObs] = useState(false);
  const [newObsText, setNewObsText] = useState('');

  // ── 数据推导 ──────────────────────────────────────────────
  const characters = useMemo(
    () => (graph?.entities ?? []).filter(e => e.type === 'character'),
    [graph],
  );

  // 从图谱跳转时自动定位到指定角色
  useEffect(() => {
    if (!highlightName || selectedId) return;
    const found = characters.find(c => c.name === highlightName);
    if (found) { setSelectedId(found.id); setDetailTab('attrs'); }
  }, [highlightName, characters, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.observations.some(o => o.toLowerCase().includes(q)) ||
      Object.values(c.attributes).some(v => v.toLowerCase().includes(q))
    );
  }, [characters, search]);

  const selected = selectedId ? characters.find(c => c.id === selectedId) : null;

  // 匹配胶囊（按角色名）
  const matchedCapsule = selected
    ? (capsules.find(c => c.name === selected.name) ?? null)
    : null;

  const selRels = useMemo(() => {
    if (!selected || !graph) return [];
    return graph.relations.filter(r => r.from === selected.name || r.to === selected.name);
  }, [selected, graph]);

  const attrGroups = useMemo(() => {
    const groups: Record<'appearance' | 'personality' | 'other', Record<string, string>> = {
      appearance: {}, personality: {}, other: {},
    };
    if (!selected) return groups;
    for (const [k, v] of Object.entries(selected.attributes)) {
      groups[classifyAttr(k)][k] = v;
    }
    return groups;
  }, [selected]);

  // ── 操作 ────────────────────────────────────────────────────
  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const entity = await addEntity(name, 'character', [], {}, []);
      if (entity) setSelectedId(entity.id);
      setNewName(''); setShowAddForm(false);
    } finally { setIsCreating(false); }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm(`确认删除角色「${name}」？关联关系也将删除。`)) return;
    await removeEntity(name);
    setSelectedId(null);
  };

  const handleAddAttr = async () => {
    if (!selected || !newAttrKey.trim() || !newAttrVal.trim()) return;
    await addEntity(selected.name, 'character', selected.observations,
      { ...selected.attributes, [newAttrKey.trim()]: newAttrVal.trim() }, selected.tags);
    await loadGraph();
    setNewAttrKey(''); setNewAttrVal(''); setShowAddAttr(false);
  };

  const handleRemoveAttr = async (key: string) => {
    if (!selected) return;
    const rest = Object.fromEntries(
      Object.entries(selected.attributes).filter(([attrKey]) => attrKey !== key),
    );
    await addEntity(selected.name, 'character', selected.observations, rest, selected.tags);
    await loadGraph();
  };

  const handleAddObs = async () => {
    if (!selected || !newObsText.trim()) return;
    await addEntity(selected.name, 'character', [...selected.observations, newObsText.trim()],
      selected.attributes, selected.tags);
    await loadGraph();
    setNewObsText(''); setShowAddObs(false);
  };

  const handleRemoveObs = async (idx: number) => {
    if (!selected) return;
    await addEntity(selected.name, 'character', [
      ...selected.observations.slice(0, idx),
      ...selected.observations.slice(idx + 1),
    ],
      selected.attributes, selected.tags);
    await loadGraph();
  };

  // ── 主渲染 ─────────────────────────────────────────────────
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel char-panel" onClick={e => e.stopPropagation()}>

        {/* 标题栏 */}
        <div className="modal-header">
          <span>
            👤 角色管理
            {characters.length > 0 && (
              <span className="char-count-pill">{characters.length} 位角色</span>
            )}
            {capsules.length > 0 && (
              <span className="char-count-pill" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                {capsules.length} 个胶囊
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {onViewGraph && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11 }}
                onClick={onViewGraph}
                title="打开全图谱">
                🕸 图谱
              </button>
            )}
            {loading && <span style={{ fontSize: 11, opacity: 0.5 }}>加载中…</span>}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="char-body">

          {/* ── 左侧：角色列表 ──────────────────────────────── */}
          <div className="char-list-col">
            <div className="char-search-row">
              <input
                className="char-search"
                placeholder="搜索角色…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="char-list">
              {filtered.length === 0 && !loading && (
                <div className="char-list-empty">
                  {search ? '未找到匹配角色' : '暂无角色数据'}
                </div>
              )}
              {filtered.map(c => {
                const hasCapsule = capsules.some(cap => cap.name === c.name);
                return (
                  <button
                    key={c.id}
                    className={`char-list-item ${selectedId === c.id ? 'active' : ''}`}
                    onClick={() => { setSelectedId(c.id); setDetailTab('attrs'); }}
                  >
                    <span className="char-list-avatar">{c.name.charAt(0)}</span>
                    <span className="char-list-name">{c.name}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center' }}>
                      {hasCapsule && (
                        <span title="有胶囊数据" style={{ fontSize: 10 }}>🧩</span>
                      )}
                      {c.firstChapter != null && (
                        <span className="char-list-ch">第{c.firstChapter}章</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 新增角色 */}
            {showAddForm ? (
              <div className="char-add-form">
                <input
                  className="char-add-input"
                  placeholder="角色姓名…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') { setShowAddForm(false); setNewName(''); }
                  }}
                  autoFocus maxLength={30}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }}
                    onClick={handleCreate} disabled={!newName.trim() || isCreating}>
                    {isCreating ? '创建中…' : '创建'}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 11 }}
                    onClick={() => { setShowAddForm(false); setNewName(''); }}>
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost char-add-btn"
                onClick={() => setShowAddForm(true)} disabled={!bookId}>
                + 新增角色
              </button>
            )}
          </div>

          {/* ── 右侧：详情卡片 ──────────────────────────────── */}
          <div className="char-detail-col">
            {!selected ? (
              <div className="char-detail-empty">
                <div style={{ fontSize: 36 }}>👤</div>
                <div>从左侧选择一位角色</div>
                <div style={{ fontSize: 11, opacity: 0.5 }}>
                  {characters.length === 0
                    ? '通过「新增角色」或 MCP 规划工具添加角色'
                    : `共 ${characters.length} 位角色可选`}
                </div>
              </div>
            ) : (
              <div className="char-card">

                {/* 卡片标题 */}
                <div className="char-card-header">
                  <div className="char-card-avatar">{selected.name.charAt(0)}</div>
                  <div className="char-card-title-group">
                    <div className="char-card-name">{selected.name}</div>
                    <div className="char-card-meta">
                      <span className="char-card-source"
                        style={{ color: selected.source === 'auto_extract' ? '#60a5fa' : '#a78bfa' }}>
                        {selected.source === 'auto_extract' ? 'AI 提取' : '手动添加'}
                      </span>
                      {matchedCapsule && (
                        <span style={{ color: '#a78bfa', fontSize: 10, marginLeft: 4 }}>· 有胶囊</span>
                      )}
                      {selected.firstChapter != null && (
                        <span style={{ color: 'var(--text-muted, #888)', fontSize: 11 }}>
                          · 首现第{selected.firstChapter}章
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, color: '#f87171' }}
                    onClick={() => handleDelete(selected.name)}>
                    删除
                  </button>
                </div>

                {/* 详情 Tab 切换 */}
                <div className="char-detail-tabs">
                  <button
                    className={`char-detail-tab ${detailTab === 'attrs' ? 'active' : ''}`}
                    onClick={() => setDetailTab('attrs')}>
                    📋 属性 &amp; 关系
                  </button>
                  <button
                    className={`char-detail-tab ${detailTab === 'scene' ? 'active' : ''}`}
                    onClick={() => setDetailTab('scene')}>
                    🧩 场景注入
                    {matchedCapsule && <span className="char-capsule-dot" />}
                  </button>
                </div>

                {/* Tab 内容 */}
                {detailTab === 'attrs' && (
                  <>
                    {/* 外貌属性 */}
                    {Object.keys(attrGroups.appearance).length > 0 && (
                      <div className="char-section">
                        <div className="char-section-title">外貌</div>
                        <div className="char-attrs">
                          {Object.entries(attrGroups.appearance).map(([k, v]) => (
                            <AttrRow key={k} attrKey={k} value={v} onRemove={handleRemoveAttr} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 性格属性 */}
                    {Object.keys(attrGroups.personality).length > 0 && (
                      <div className="char-section">
                        <div className="char-section-title">性格 &amp; 能力</div>
                        <div className="char-attrs">
                          {Object.entries(attrGroups.personality).map(([k, v]) => (
                            <AttrRow key={k} attrKey={k} value={v} onRemove={handleRemoveAttr} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 其他属性 */}
                    {Object.keys(attrGroups.other).length > 0 && (
                      <div className="char-section">
                        <div className="char-section-title">其他属性</div>
                        <div className="char-attrs">
                          {Object.entries(attrGroups.other).map(([k, v]) => (
                            <AttrRow key={k} attrKey={k} value={v} onRemove={handleRemoveAttr} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 添加属性 */}
                    {showAddAttr ? (
                      <div className="char-add-attr-form">
                        <input className="char-inline-input" placeholder="属性名（如：性格）"
                          value={newAttrKey} onChange={e => setNewAttrKey(e.target.value)} maxLength={20} />
                        <input className="char-inline-input" placeholder="属性值（如：冷静果断）"
                          value={newAttrVal} onChange={e => setNewAttrVal(e.target.value)} maxLength={80}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddAttr(); }} />
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary" style={{ fontSize: 11 }}
                            onClick={handleAddAttr} disabled={!newAttrKey.trim() || !newAttrVal.trim()}>
                            添加
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize: 11 }}
                            onClick={() => { setShowAddAttr(false); setNewAttrKey(''); setNewAttrVal(''); }}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="char-add-inline-btn" onClick={() => setShowAddAttr(true)}>
                        + 添加属性
                      </button>
                    )}

                    {/* 观察事实 */}
                    <div className="char-section">
                      <div className="char-section-title">
                        人物事实
                        <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 400, marginLeft: 4 }}>
                          ({selected.observations.length})
                        </span>
                      </div>
                      {selected.observations.length === 0
                        ? <div className="char-obs-empty">暂无事实记录</div>
                        : (
                          <div className="char-obs-list">
                            {selected.observations.map((obs, i) => (
                              <ObsRow key={i} text={obs} onRemove={() => handleRemoveObs(i)} />
                            ))}
                          </div>
                        )
                      }
                      {showAddObs ? (
                        <div className="char-add-attr-form" style={{ marginTop: 6 }}>
                          <textarea
                            className="char-inline-input char-inline-textarea"
                            placeholder="如：曾在第三章中背叛过主角…"
                            value={newObsText} onChange={e => setNewObsText(e.target.value)}
                            rows={2} maxLength={200}
                          />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary" style={{ fontSize: 11 }}
                              onClick={handleAddObs} disabled={!newObsText.trim()}>
                              添加
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: 11 }}
                              onClick={() => { setShowAddObs(false); setNewObsText(''); }}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="char-add-inline-btn" onClick={() => setShowAddObs(true)}>
                          + 添加事实
                        </button>
                      )}
                    </div>

                    {/* 关系网络 */}
                    <div className="char-section">
                      <div className="char-section-title">
                        关系网络
                        <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 400, marginLeft: 4 }}>
                          ({selRels.length})
                        </span>
                      </div>
                      {selRels.length === 0
                        ? <div className="char-obs-empty">暂无关系（通过 MCP 规划工具自动生成）</div>
                        : (
                          <div className="char-rels-list">
                            {selRels.slice(0, 12).map(r => (
                              <RelRow key={r.id} rel={r} selfName={selected.name}
                                entities={graph?.entities ?? []} />
                            ))}
                            {selRels.length > 12 && (
                              <div style={{ fontSize: 10, opacity: 0.4, padding: '2px 0' }}>
                                …还有 {selRels.length - 12} 条关系
                              </div>
                            )}
                          </div>
                        )
                      }
                    </div>
                  </>
                )}

                {detailTab === 'scene' && selected && (
                  <CapsuleEditTab
                    capsule={matchedCapsule}
                    characterName={selected.name}
                    editing={editingCapsule}
                    draft={capsuleDraft}
                    saving={savingCapsule}
                    onInject={onInjectContext}
                    onStartEdit={() => {
                      setCapsuleDraft(matchedCapsule
                        ? { ...matchedCapsule }
                        : { name: selected.name, identity: '', personality: '', voice: '' }
                      );
                      setEditingCapsule(true);
                    }}
                    onCancelEdit={() => { setEditingCapsule(false); setCapsuleDraft({}); }}
                    onDraftChange={(patch) => setCapsuleDraft(prev => ({ ...prev, ...patch }))}
                    onSave={async () => {
                      if (!onCreateCapsule && !onUpdateCapsule) return;
                      setSavingCapsule(true);
                      try {
                        if (matchedCapsule && onUpdateCapsule) {
                          await onUpdateCapsule(matchedCapsule.id, capsuleDraft);
                        } else if (!matchedCapsule && onCreateCapsule) {
                          await onCreateCapsule(selected.name, capsuleDraft);
                        }
                        setEditingCapsule(false);
                        setCapsuleDraft({});
                      } finally {
                        setSavingCapsule(false);
                      }
                    }}
                    onDelete={matchedCapsule && onDeleteCapsule ? async () => {
                      if (!window.confirm(`确认删除「${selected.name}」的胶囊？`)) return;
                      await onDeleteCapsule!(matchedCapsule!.id);
                    } : undefined}
                    canEdit={!!(onCreateCapsule || onUpdateCapsule)}
                  />
                )}

              </div>
            )}

            {error && (
              <div style={{ color: '#f87171', fontSize: 11, padding: 8 }}>
                ❌ {error}
                <button className="btn btn-ghost" style={{ fontSize: 10, marginLeft: 6 }} onClick={loadGraph}>
                  重试
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
