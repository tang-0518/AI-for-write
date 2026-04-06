// =============================================================
// db/index.ts — IndexedDB 封装
//
// 数据库：novel-assistant  版本：3
// Object Stores：
//   books          — keyPath: 'id'，一条记录 = 一本书
//   drafts         — keyPath: 'id'，一条记录 = 一个章节（含 bookId）
//   memories       — keyPath: 'id'，一条记录 = 一条记忆
//   style_profiles — keyPath: 'id'，一条记录 = 一份文风档案
//   kv             — 通用键值对（排序、激活 ID 等）
// =============================================================

const DB_NAME    = 'novel-assistant';
const DB_VERSION = 3;

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      // v1 stores
      if (!db.objectStoreNames.contains('drafts'))   db.createObjectStore('drafts',   { keyPath: 'id' });
      if (!db.objectStoreNames.contains('memories')) db.createObjectStore('memories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv'))       db.createObjectStore('kv');
      // v2 stores
      if (!db.objectStoreNames.contains('books'))    db.createObjectStore('books',    { keyPath: 'id' });
      // v3 stores
      if (!db.objectStoreNames.contains('style_profiles'))
        db.createObjectStore('style_profiles', { keyPath: 'id' });
    };

    req.onsuccess  = () => { _db = req.result; resolve(_db); };
    req.onerror    = () => reject(req.error);
    req.onblocked  = () => console.warn('[db] upgrade blocked by another tab');
  });
}

// ── 通用辅助 ──────────────────────────────────────────────────

type StoreName = 'drafts' | 'memories' | 'books' | 'style_profiles';

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
  });
}

export async function dbPut(store: StoreName, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function dbReplaceAll(store: StoreName, items: unknown[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    for (const item of items) tx.objectStore(store).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── KV 键值对 ─────────────────────────────────────────────────

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror   = () => reject(req.error);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ── 从 localStorage 一次性迁移 ────────────────────────────────

export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const existingBooks = await dbGetAll<{ id: string }>('books');
    const existingDrafts = await dbGetAll<{ id: string }>('drafts');

    // 迁移记忆（总是尝试，幂等）
    const rawMem = localStorage.getItem('novel-ai-memories');
    if (rawMem) {
      const memories = JSON.parse(rawMem) as { id: string }[];
      const existingMemIds = new Set((await dbGetAll<{ id: string }>('memories')).map(m => m.id));
      const db = await openDB();
      if (memories.some(m => !existingMemIds.has(m.id))) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('memories', 'readwrite');
          for (const m of memories) tx.objectStore('memories').put(m);
          tx.oncomplete = () => resolve();
          tx.onerror    = () => reject(tx.error);
        });
      }
    }

    // 已有书目，跳过草稿迁移
    if (existingBooks.length > 0) return;

    // 迁移旧草稿到默认书目
    const rawDrafts = localStorage.getItem('novel-ai-drafts');
    const oldDrafts: ({ id: string; title: string; content: string; updatedAt: number; contextState?: unknown })[] =
      rawDrafts ? JSON.parse(rawDrafts) : [];

    const now = Date.now();
    const defaultBook = {
      id: `book_${now}`,
      title: '我的小说',
      synopsis: '',
      createdAt: now,
      updatedAt: now,
    };
    await dbPut('books', defaultBook);
    await kvSet('active-book-id', defaultBook.id);
    await kvSet('book-order', [defaultBook.id]);

    if (oldDrafts.length > 0) {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('drafts', 'readwrite');
        oldDrafts.forEach((d, i) => {
          tx.objectStore('drafts').put({ ...d, bookId: defaultBook.id, order: i });
        });
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
      });
      // 迁移章节顺序和激活 ID
      const chapterOrder = oldDrafts.map(d => d.id);
      await kvSet(`chapter-order-${defaultBook.id}`, chapterOrder);
      const rawActive = localStorage.getItem('novel-ai-active');
      if (rawActive) {
        try { await kvSet('active-draft-id', JSON.parse(rawActive)); } catch { /* ignore */ }
      }
    } else if (existingDrafts.length === 0) {
      // 全新安装：不在这里创建章节，让 useBooks 处理
    }

    console.info('[db] 从 localStorage 迁移完成');
  } catch (err) {
    console.warn('[db] 迁移失败', err);
  }
}
