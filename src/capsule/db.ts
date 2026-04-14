// =============================================================
// capsule/db.ts — 角色胶囊 IndexedDB CRUD
// =============================================================

import type { CharacterCapsule, CapsuleCurrentState } from './types';
import { DEFAULT_CAPSULE_STATE, CAPSULE_COLORS } from './types';
import { openDB } from '../db/index';
import { generateId } from '../utils/id';
import { buildPromptSnippet, estimateCapsuleTokens } from './promptBuilder';

const STORE = 'character_capsules' as const;

// ── 读取 ──────────────────────────────────────────────────────

export async function loadCapsulesAsync(): Promise<CharacterCapsule[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as CharacterCapsule[]).sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror   = () => reject(req.error);
  });
}

export async function loadCapsulesByBook(bookId: string): Promise<CharacterCapsule[]> {
  const all = await loadCapsulesAsync();
  return all.filter(c => c.bookId === bookId);
}

export async function loadCapsuleByName(bookId: string, name: string): Promise<CharacterCapsule | null> {
  const all = await loadCapsulesByBook(bookId);
  return all.find(c => c.name === name) ?? null;
}

// ── 写入 ──────────────────────────────────────────────────────

export async function upsertCapsuleAsync(
  data: Omit<CharacterCapsule, 'id' | 'createdAt' | 'updatedAt' | 'promptSnippet' | 'tokenEstimate'> & { id?: string; createdAt?: number },
): Promise<CharacterCapsule> {
  const db  = await openDB();
  const now = Date.now();

  // 自动构建 promptSnippet
  const snippet  = buildPromptSnippet(data as CharacterCapsule);
  const estimate = estimateCapsuleTokens(snippet);

  const capsule: CharacterCapsule = {
    ...data,
    id:            data.id ?? generateId(),
    createdAt:     data.createdAt ?? now,
    updatedAt:     now,
    promptSnippet: snippet,
    tokenEstimate: estimate,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(capsule);
    tx.oncomplete = () => resolve(capsule);
    tx.onerror    = () => reject(tx.error);
  });
}

export async function deleteCapsuleAsync(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── 快速创建（用于从记忆迁移 / AI 自动提取）─────────────────

export function buildNewCapsule(
  bookId: string,
  name: string,
  partial: Partial<Omit<CharacterCapsule, 'id' | 'bookId' | 'name'>>,
): Omit<CharacterCapsule, 'id' | 'createdAt' | 'updatedAt' | 'promptSnippet' | 'tokenEstimate'> {
  const colorIndex = Math.abs(hashString(name)) % CAPSULE_COLORS.length;
  return {
    bookId,
    name,
    color:        CAPSULE_COLORS[colorIndex],
    identity:     partial.identity     ?? '',
    backstory:    partial.backstory    ?? '',
    personality:  partial.personality  ?? '',
    voice:        partial.voice        ?? '',
    appearance:   partial.appearance   ?? '',
    currentState: partial.currentState ?? { ...DEFAULT_CAPSULE_STATE },
    autoExtracted: partial.autoExtracted ?? false,
    sourceMemoryId: partial.sourceMemoryId,
  };
}

// ── 从记忆宫殿条目迁移 ────────────────────────────────────────

import type { MemoryEntry } from '../memory/types';

export async function migrateCapsuleFromMemory(entry: MemoryEntry): Promise<CharacterCapsule> {
  return upsertCapsuleAsync({
    ...buildNewCapsule(entry.bookId ?? '', entry.name, {
      identity:      entry.description || entry.name,
      personality:   entry.content,
      autoExtracted: entry.autoExtracted ?? false,
      sourceMemoryId: entry.id,
    }),
  });
}

// ── 工具函数 ──────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// 更新胶囊状态（章节推进时调用）
export async function updateCapsuleState(
  id: string,
  statePatch: Partial<CapsuleCurrentState>,
): Promise<CharacterCapsule | null> {
  await openDB();
  const all = await loadCapsulesAsync();
  const cap = all.find(c => c.id === id);
  if (!cap) return null;

  return upsertCapsuleAsync({
    ...cap,
    id: cap.id,
    currentState: { ...cap.currentState, ...statePatch },
  });
}
