// src/api/foreshadow.ts — 伏笔台账 API 客户端

const BASE = 'http://localhost:8005/api/v1';

export interface BackendForeshadowItem {
  id: string;
  chapter: number;
  character_id: string;
  hidden_clue: string;
  sensory_anchors: Record<string, string>;
  status: 'pending' | 'consumed';
  consumed_at_chapter: number | null;
  suggested_resolve_chapter?: number | null;
  importance: string;
  created_at: string;
}

export interface ForeshadowSuggestion {
  entry: BackendForeshadowItem;
  score: number;
  reason: string;
}

export interface ChapterSuggestionsResponse {
  chapter_number: number;
  outline_excerpt: string;
  items: ForeshadowSuggestion[];
  note: string;
}

/** 创建或覆盖一条伏笔条目（幂等：先 POST，已存在则 PUT） */
export async function upsertForeshadowItem(
  novelId: string,
  item: {
    entry_id: string;
    chapter: number;
    hidden_clue: string;
    character_id?: string;
    sensory_anchors?: Record<string, string>;
    suggested_resolve_chapter?: number;
  },
): Promise<boolean> {
  const body = {
    entry_id: item.entry_id,
    chapter: item.chapter,
    character_id: item.character_id ?? '',
    hidden_clue: item.hidden_clue,
    sensory_anchors: item.sensory_anchors ?? {},
  };
  try {
    const res = await fetch(`${BASE}/novels/${novelId}/foreshadow-ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.status === 201 || res.status === 200;
  } catch {
    return false;
  }
}

/** 将一条伏笔标记为已回收 */
export async function consumeForeshadowItem(
  novelId: string,
  entryId: string,
  consumedAtChapter: number,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BASE}/novels/${novelId}/foreshadow-ledger/${entryId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'consumed', consumed_at_chapter: consumedAtChapter }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** 列出全部伏笔条目 */
export async function listForeshadowings(
  novelId: string,
  status?: 'pending' | 'consumed',
): Promise<BackendForeshadowItem[]> {
  try {
    const url = new URL(`${BASE}/novels/${novelId}/foreshadow-ledger`);
    if (status) url.searchParams.set('status', status);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** 获取当前章节建议回收的伏笔列表 */
export async function getChapterForeshadowSuggestions(
  novelId: string,
  chapterNumber: number,
  outline = '',
): Promise<ChapterSuggestionsResponse | null> {
  try {
    const url = new URL(`${BASE}/novels/${novelId}/foreshadow-ledger/chapter-suggestions`);
    url.searchParams.set('chapter_number', String(chapterNumber));
    if (outline) url.searchParams.set('outline', outline.slice(0, 500));
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
