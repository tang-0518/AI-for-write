// =============================================================
// hooks/useBooks.ts — 书目 + 章节管理 Hook（IndexedDB 持久化）
// =============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_DRAFT_CONTEXT_STATE } from '../types';
import type { Book, DraftContextState } from '../types';
import { dbGetAll, dbPut, dbDelete, dbReplaceAll, kvGet, kvSet } from '../db/index';

// Draft = 章节
export interface Draft {
  id: string;
  bookId: string;
  title: string;
  content: string;
  order: number;
  updatedAt: number;
  contextState: DraftContextState;
}

// ── 工厂函数 ──────────────────────────────────────────────────

function newBook(title: string, synopsis = ''): Book {
  const now = Date.now();
  return { id: `book_${now}`, title, synopsis, createdAt: now, updatedAt: now };
}

function chapterTitle(order: number): string {
  const nums = ['一','二','三','四','五','六','七','八','九','十',
                '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十'];
  return `第${nums[order] ?? (order + 1)}章`;
}

function newChapter(bookId: string, order: number): Draft {
  return {
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    bookId,
    title: chapterTitle(order),
    content: '',
    order,
    updatedAt: Date.now(),
    contextState: { ...DEFAULT_DRAFT_CONTEXT_STATE },
  };
}

function normalizeChapter(d: Draft): Draft {
  return {
    ...d,
    bookId: d.bookId ?? '',
    order: d.order ?? 0,
    contextState: { ...DEFAULT_DRAFT_CONTEXT_STATE, ...d.contextState },
  };
}

// 防抖写入 IDB
function useDebounceCallback(fn: (...args: unknown[]) => void, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: unknown[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// ── Hook ──────────────────────────────────────────────────────

export function useBooks() {
  const [books, setBooksState] = useState<Book[]>([]);
  const [chapters, setChaptersState] = useState<Draft[]>([]);
  const [activeBookId, setActiveBookIdState] = useState<string>('');
  const [activeDraftId, setActiveDraftIdState] = useState<string>('');
  const [loaded, setLoaded] = useState(false);

  // ── 初始化 ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [allBooks, allChapters, bookOrder, activeBookId, activeDraftId] = await Promise.all([
          dbGetAll<Book>('books'),
          dbGetAll<Draft>('drafts'),
          kvGet<string[]>('book-order'),
          kvGet<string>('active-book-id'),
          kvGet<string>('active-draft-id'),
        ]);

        // 整理书目顺序
        let orderedBooks: Book[];
        if (bookOrder && bookOrder.length > 0) {
          const byId = new Map(allBooks.map(b => [b.id, b]));
          orderedBooks = bookOrder.map(id => byId.get(id)).filter(Boolean) as Book[];
          for (const b of allBooks) {
            if (!orderedBooks.find(x => x.id === b.id)) orderedBooks.push(b);
          }
        } else {
          orderedBooks = allBooks.sort((a, b) => a.createdAt - b.createdAt);
        }

        const normalizedChapters = allChapters.map(normalizeChapter);

        if (orderedBooks.length === 0) {
          // 全新安装，等待用户创建第一本书
          setLoaded(true);
          return;
        }

        setBooksState(orderedBooks);
        setChaptersState(normalizedChapters);

        const validBook = orderedBooks.find(b => b.id === activeBookId) ?? orderedBooks[0];
        setActiveBookIdState(validBook.id);

        // 确定激活章节
        const bookChapters = normalizedChapters
          .filter(c => c.bookId === validBook.id)
          .sort((a, b) => a.order - b.order);

        if (bookChapters.length === 0) {
          // 书存在但无章节 → 创建第一章
          const ch = newChapter(validBook.id, 0);
          await dbPut('drafts', ch);
          setChaptersState([ch]);
          setActiveDraftIdState(ch.id);
          await kvSet('active-draft-id', ch.id);
        } else {
          const validChapter = bookChapters.find(c => c.id === activeDraftId) ?? bookChapters[0];
          setActiveDraftIdState(validChapter.id);
        }
      } catch (err) {
        console.error('[useBooks] 加载失败', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // ── 持久化辅助 ────────────────────────────────────────────
  const setActiveBookId = useCallback((id: string) => {
    setActiveBookIdState(id);
    kvSet('active-book-id', id).catch(() => {});
  }, []);

  const setActiveDraftId = useCallback((id: string) => {
    setActiveDraftIdState(id);
    kvSet('active-draft-id', id).catch(() => {});
  }, []);

  // ── 书目 CRUD ────────────────────────────────────────────

  const createBook = useCallback(async (title: string, synopsis = ''): Promise<Book> => {
    const book = newBook(title, synopsis);
    await dbPut('books', book);
    setBooksState(prev => {
      const next = [...prev, book];
      kvSet('book-order', next.map(b => b.id)).catch(() => {});
      return next;
    });
    setActiveBookId(book.id);

    // 自动创建第一章
    const ch = newChapter(book.id, 0);
    await dbPut('drafts', ch);
    setChaptersState(prev => [...prev, ch]);
    setActiveDraftId(ch.id);
    return book;
  }, [setActiveBookId, setActiveDraftId]);

  const updateBookMeta = useCallback((id: string, patch: Partial<Pick<Book, 'title' | 'synopsis'>>) => {
    setBooksState(prev => {
      const next = prev.map(b => {
        if (b.id !== id) return b;
        const updated = { ...b, ...patch, updatedAt: Date.now() };
        dbPut('books', updated).catch(() => {});
        return updated;
      });
      return next;
    });
  }, []);

  const deleteBook = useCallback(async (id: string) => {
    await dbDelete('books', id);
    // 删除该书所有章节
    setChaptersState(prev => {
      const toDelete = prev.filter(c => c.bookId === id);
      Promise.all(toDelete.map(c => dbDelete('drafts', c.id))).catch(() => {});
      return prev.filter(c => c.bookId !== id);
    });
    setBooksState(prev => {
      const next = prev.filter(b => b.id !== id);
      kvSet('book-order', next.map(b => b.id)).catch(() => {});
      if (next.length > 0) setActiveBookId(next[0].id);
      return next;
    });
  }, [setActiveBookId]);

  const switchBook = useCallback((bookId: string) => {
    setActiveBookId(bookId);
    setChaptersState(prev => {
      const bookChs = prev.filter(c => c.bookId === bookId).sort((a, b) => a.order - b.order);
      if (bookChs.length > 0) setActiveDraftId(bookChs[0].id);
      return prev;
    });
  }, [setActiveBookId, setActiveDraftId]);

  // ── 章节 CRUD ────────────────────────────────────────────

  const selectDraft = useCallback((id: string) => {
    setActiveDraftId(id);
  }, [setActiveDraftId]);

  const createChapter = useCallback(async (bookId: string) => {
    const existingInBook = chapters.filter(c => c.bookId === bookId);
    const ch = newChapter(bookId, existingInBook.length);
    await dbPut('drafts', ch);
    setChaptersState(prev => [...prev, ch]);
    setActiveDraftId(ch.id);
    return ch.id;
  }, [chapters, setActiveDraftId]);

  const deleteChapter = useCallback(async (id: string) => {
    await dbDelete('drafts', id);
    setChaptersState(prev => {
      const ch = prev.find(c => c.id === id);
      const next = prev.filter(c => c.id !== id);
      if (ch) {
        const bookChs = next
          .filter(c => c.bookId === ch.bookId)
          .sort((a, b) => a.order - b.order);
        if (bookChs.length > 0) {
          setActiveDraftId(bookChs[0].id);
        }
      }
      return next;
    });
  }, [setActiveDraftId]);

  const updateChapterTitle = useCallback((id: string, title: string) => {
    setChaptersState(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, title };
      dbPut('drafts', updated).catch(() => {});
      return updated;
    }));
  }, []);

  const flushChapterContent = useCallback((id: string, content: string) => {
    setChaptersState(prev => {
      const ch = prev.find(c => c.id === id);
      if (!ch) return prev;
      const updated = { ...ch, content, updatedAt: Date.now() };
      dbPut('drafts', updated).catch(() => {});
      return prev;
    });
  }, []);

  const _debounced = useDebounceCallback(
    (id: unknown, content: unknown) => flushChapterContent(id as string, content as string),
    300,
  );

  const updateContent = useCallback((id: string, content: string) => {
    setChaptersState(prev => prev.map(c =>
      c.id === id ? { ...c, content, updatedAt: Date.now() } : c
    ));
    _debounced(id, content);
  }, [_debounced]);

  const updateContextState = useCallback((id: string, contextState: DraftContextState) => {
    setChaptersState(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, contextState, updatedAt: Date.now() };
      dbPut('drafts', updated).catch(() => {});
      return updated;
    }));
  }, []);

  const reorderChapters = useCallback((bookId: string, fromIndex: number, toIndex: number) => {
    setChaptersState(prev => {
      const bookChs = prev.filter(c => c.bookId === bookId).sort((a, b) => a.order - b.order);
      const others  = prev.filter(c => c.bookId !== bookId);
      const reordered = [...bookChs];
      const [removed] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, removed);
      // 更新 order 字段
      const updated = reordered.map((c, i) => ({ ...c, order: i }));
      Promise.all(updated.map(c => dbPut('drafts', c))).catch(() => {});
      return [...others, ...updated];
    });
  }, []);

  /** beforeunload 时强制刷盘 */
  const flushAll = useCallback(async (currentChapters: Draft[]) => {
    await dbReplaceAll('drafts', currentChapters);
  }, []);

  /**
   * 导入书目：原子性写入书籍 + 批量章节，不创建默认空章节。
   * 适用于 TXT 导入场景。
   */
  const createBookWithChapters = useCallback(async (
    title: string,
    synopsis: string,
    importedChapters: { title: string; content: string }[],
  ): Promise<Book> => {
    const book = newBook(title, synopsis);
    await dbPut('books', book);

    const now = Date.now();
    const drafts: Draft[] = importedChapters.map((c, i) => ({
      id: `ch_${now + i}_${Math.random().toString(36).slice(2, 6)}`,
      bookId: book.id,
      title: c.title,
      content: c.content,
      order: i,
      updatedAt: now,
      contextState: { ...DEFAULT_DRAFT_CONTEXT_STATE },
    }));

    // 批量写入（逐条写入避免单个大事务超时）
    for (const draft of drafts) {
      await dbPut('drafts', draft);
    }

    setBooksState(prev => {
      const next = [...prev, book];
      kvSet('book-order', next.map(b => b.id)).catch(() => {});
      return next;
    });
    setActiveBookId(book.id);
    setChaptersState(prev => [...prev, ...drafts]);
    if (drafts.length > 0) setActiveDraftId(drafts[0].id);

    return book;
  }, [setActiveBookId, setActiveDraftId]);

  // ── 派生状态 ────────────────────────────────────────────
  const activeBook = books.find(b => b.id === activeBookId) ?? books[0];
  const activeDraft = chapters.find(c => c.id === activeDraftId) ??
    chapters.filter(c => c.bookId === activeBookId).sort((a, b) => a.order - b.order)[0];

  const bookChapters = useCallback((bookId: string) =>
    chapters.filter(c => c.bookId === bookId).sort((a, b) => a.order - b.order),
  [chapters]);

  return {
    books,
    chapters,
    activeBook,
    activeDraft,
    activeBookId: activeBook?.id ?? '',
    activeDraftId: activeDraft?.id ?? '',
    loaded,
    bookChapters,
    createBook,
    createBookWithChapters,
    updateBookMeta,
    deleteBook,
    switchBook,
    selectDraft,
    createChapter,
    deleteChapter,
    updateChapterTitle,
    updateContent,
    updateContextState,
    reorderChapters,
    flushAll,
  };
}
