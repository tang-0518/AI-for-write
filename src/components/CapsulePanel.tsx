// =============================================================
// components/CapsulePanel.tsx — 角色胶囊库面板
//
// 右侧抽屉，列出当前书目的所有角色胶囊。
// 支持：新建、编辑、删除、从记忆宫殿一键迁移、注入写作上下文。
// =============================================================

import { useState, useMemo, useEffect, useRef } from 'react';
import type { CharacterCapsule } from '../capsule/types';
import type { MemoryEntry } from '../memory/types';
import { CapsuleCard }   from './CapsuleCard';
import { CapsuleEditor } from './CapsuleEditor';

interface CapsulePanelProps {
  capsules:         CharacterCapsule[];
  characterMemories: MemoryEntry[];          // 旧记忆宫殿角色条目，用于迁移
  stats:            { total: number; totalTokens: number };
  onClose:          () => void;
  onCreate:         (name: string, partial?: Partial<CharacterCapsule>) => Promise<CharacterCapsule>;
  onUpdate:         (id: string, patch: Partial<CharacterCapsule>) => Promise<CharacterCapsule>;
  onDelete:         (id: string) => Promise<void>;
  onMigrateMemory:  (entries: MemoryEntry[]) => Promise<number>;
  onInjectContext?: (snippet: string) => void;
  onViewGraph?:     (name: string) => void;
  highlightName?:   string;  // 从图谱跳转时高亮的角色名
}

export default function CapsulePanel({
  capsules, characterMemories, stats, onClose,
  onCreate, onUpdate, onDelete,
  onMigrateMemory, onInjectContext, onViewGraph, highlightName,
}: CapsulePanelProps) {
  const [search,    setSearch]    = useState('');
  const [editing,   setEditing]   = useState<CharacterCapsule | null | 'new'>('new' as unknown as null);
  const [showEditor, setShowEditor] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // 从图谱跳转时：自动滚动到目标角色卡片
  useEffect(() => {
    if (!highlightName || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-name="${CSS.escape(highlightName)}"]`);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    }
  }, [highlightName]);

  // 重置 editing 为 null
  const closeEditor = () => { setShowEditor(false); setEditing(null as unknown as CharacterCapsule); };
  const openNew     = () => { setEditing(null as unknown as CharacterCapsule); setShowEditor(true); };
  const openEdit    = (c: CharacterCapsule) => { setEditing(c); setShowEditor(true); };

  const filtered = useMemo(() => {
    if (!search.trim()) return capsules;
    const q = search.toLowerCase();
    return capsules.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.identity.toLowerCase().includes(q) ||
      c.personality.toLowerCase().includes(q)
    );
  }, [capsules, search]);

  const handleSave = async (data: Parameters<typeof onCreate>[1] & { id?: string; name: string }) => {
    const { id, name, ...rest } = data as CharacterCapsule & { id?: string };
    if (id) {
      await onUpdate(id, { name, ...rest });
    } else {
      await onCreate(name, rest);
    }
  };

  const handleMigrate = async () => {
    const toMigrate = characterMemories.filter(m =>
      !capsules.some(c => c.name === m.name)
    );
    if (!toMigrate.length) {
      setMigrateMsg('没有可迁移的角色');
      setTimeout(() => setMigrateMsg(''), 2500);
      return;
    }
    setMigrating(true);
    const count = await onMigrateMemory(toMigrate);
    setMigrating(false);
    setMigrateMsg(`已迁移 ${count} 个角色`);
    setTimeout(() => setMigrateMsg(''), 3000);
  };

  const unmigrated = characterMemories.filter(m =>
    !capsules.some(c => c.name === m.name)
  );

  return (
    <div className="capsule-panel">
      {/* 标题栏 */}
      <div className="capsule-header">
        <div className="capsule-header-top">
          <span className="capsule-title">🧩 角色胶囊库</span>
          <button className="capsule-close" onClick={onClose}>✕</button>
        </div>
        <div className="capsule-meta">
          {stats.total} 个角色 · 共 ~{stats.totalTokens} token
        </div>
      </div>

      {/* 搜索 + 操作 */}
      <div className="capsule-toolbar">
        <input
          className="capsule-search"
          placeholder="搜索角色…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="capsule-btn-new" onClick={openNew}>＋ 新建</button>
      </div>

      {/* 迁移提示 */}
      {unmigrated.length > 0 && (
        <div className="capsule-migrate-banner">
          <span>记忆宫殿中有 {unmigrated.length} 个角色未迁移</span>
          <button
            className="capsule-migrate-btn"
            onClick={handleMigrate}
            disabled={migrating}>
            {migrating ? '迁移中…' : '一键迁移'}
          </button>
        </div>
      )}
      {migrateMsg && (
        <div className="capsule-msg">{migrateMsg}</div>
      )}

      {/* 胶囊列表 */}
      <div className="capsule-list" ref={listRef}>
        {filtered.length === 0 && (
          <div className="capsule-empty">
            {capsules.length === 0
              ? '还没有角色胶囊，点击「新建」开始创建'
              : '没有匹配的角色'}
          </div>
        )}
        {filtered.map(cap => (
          <div key={cap.id} data-name={cap.name}
            style={highlightName === cap.name
              ? { outline: '2px solid rgba(167,139,250,0.6)', borderRadius: 10, animation: 'gp-enter 0.4s ease' }
              : undefined}>
            <CapsuleCard
              capsule={cap}
              onEdit={openEdit}
              onDelete={onDelete}
              onInject={onInjectContext}
              onViewGraph={onViewGraph}
            />
          </div>
        ))}
      </div>

      {/* 编辑弹窗 */}
      {showEditor && (
        <CapsuleEditor
          initial={editing as CharacterCapsule | null}
          onSave={handleSave as Parameters<typeof CapsuleEditor>[0]['onSave']}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}
