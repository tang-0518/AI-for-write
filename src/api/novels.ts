// src/api/novels.ts — 后端小说/章节 CRUD 客户端
// 所有函数均 fire-and-forget：失败时 console.warn，不影响前端 IndexedDB 流程

import type { Book } from '../types';
import type { Draft } from '../hooks/useBooks';

const BASE = (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8005') + '/api/v1';

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.warn(`[novels-api] POST ${path} → ${r.status}`);
      return null;
    }
    return r.json() as Promise<T>;
  } catch (e) {
    console.warn('[novels-api] network error', e);
    return null;
  }
}

async function put<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      console.warn(`[novels-api] PUT ${path} → ${r.status}`);
      return null;
    }
    return r.json() as Promise<T>;
  } catch (e) {
    console.warn('[novels-api] network error', e);
    return null;
  }
}

async function del(path: string): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}${path}`, { method: 'DELETE' });
    return r.ok;
  } catch (e) {
    console.warn('[novels-api] network error', e);
    return false;
  }
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`);
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch (e) {
    console.warn('[novels-api] network error', e);
    return null;
  }
}

// ── 小说 CRUD ────────────────────────────────────────────────

export interface BackendNovel {
  id: string;
  title: string;
  author: string;
  target_chapters: number;
  premise: string;
  stage: string;
  total_word_count: number;
  autopilot_status: string;
}

/** Book → CreateNovelRequest */
function bookToCreate(book: Book) {
  return {
    novel_id: book.id,
    title: book.title,
    author: '',
    target_chapters: 30,
    premise: book.synopsis ?? '',
  };
}

/** Book → UpdateNovelRequest */
function bookToUpdate(book: Book) {
  return {
    title: book.title,
    author: '',
    target_chapters: 30,
    premise: book.synopsis ?? '',
  };
}

export async function syncCreateNovel(book: Book): Promise<void> {
  await post('/novels/', bookToCreate(book));
}

export async function syncUpdateNovel(book: Book): Promise<void> {
  await put(`/novels/${book.id}`, bookToUpdate(book));
}

export async function syncDeleteNovel(bookId: string): Promise<void> {
  await del(`/novels/${bookId}`);
}

/** 从后端获取小说列表，用于首次启动时回填 IndexedDB */
export async function fetchNovelsFromBackend(): Promise<BackendNovel[]> {
  const data = await get<BackendNovel[]>('/novels/');
  return data ?? [];
}

// ── 章节同步 ─────────────────────────────────────────────────

/** Draft.order 是 0-based，后端 chapter_number 是 1-based */
const toChapterNum = (order: number) => order + 1;

export async function syncEnsureChapter(draft: Draft): Promise<void> {
  const num = toChapterNum(draft.order);
  // ensure 端点幂等：不存在则创建，已存在则忽略
  await post(`/novels/${draft.bookId}/chapters/${num}/ensure`, {});
}

export async function syncSaveChapter(draft: Draft): Promise<void> {
  const num = toChapterNum(draft.order);
  await put(`/novels/${draft.bookId}/chapters/${num}`, {
    content: draft.content ?? '',
  });
}

export async function syncDeleteChapter(draft: Draft): Promise<void> {
  // 后端无直接 DELETE chapter 端点；更新 content 为空以保留占位
  const num = toChapterNum(draft.order);
  await put(`/novels/${draft.bookId}/chapters/${num}`, { content: '' });
}
