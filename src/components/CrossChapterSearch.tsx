// =============================================================
// components/CrossChapterSearch.tsx — 全书跨章节搜索
// =============================================================

import { useState, useMemo } from 'react';
import type { Draft } from '../hooks/useBooks';

interface CrossChapterSearchProps {
  chapters: Draft[];
  onNavigate: (chapterId: string) => void;
  onClose: () => void;
}

interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  snippet: string;
  matchCount: number;
}

function buildSnippet(content: string, query: string, ctx = 60): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, ctx * 2).replace(/\n/g, ' ') + '…';
  const start = Math.max(0, idx - ctx);
  const end = Math.min(content.length, idx + query.length + ctx);
  const snippet = content.slice(start, end).replace(/\n/g, ' ');
  return (start > 0 ? '…' : '') + snippet + (end < content.length ? '…' : '');
}

function countMatches(text: string, query: string): number {
  if (!query) return 0;
  let n = 0, pos = 0;
  const lo = text.toLowerCase(), q = query.toLowerCase();
  while ((pos = lo.indexOf(q, pos)) !== -1) { n++; pos += q.length; }
  return n;
}

export function CrossChapterSearch({ chapters, onNavigate, onClose }: CrossChapterSearchProps) {
  const [query, setQuery] = useState('');

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim();
    if (!q) return [];
    return chapters
      .filter(c =>
        c.content.toLowerCase().includes(q.toLowerCase()) ||
        c.title.toLowerCase().includes(q.toLowerCase())
      )
      .map(c => ({
        chapterId: c.id,
        chapterTitle: c.title,
        snippet: buildSnippet(c.content, q),
        matchCount: countMatches(c.content, q) + countMatches(c.title, q),
      }))
      .sort((a, b) => b.matchCount - a.matchCount);
  }, [query, chapters]);

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel cross-search-panel">
        <div className="modal-header">
          <span className="modal-title">🔭 全书搜索</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="cross-search-bar">
          <input
            className="input cross-search-input"
            autoFocus
            placeholder="搜索关键词…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            spellCheck={false}
          />
          {query.trim() && (
            <span className="cross-search-count">{results.length} 章</span>
          )}
        </div>
        <div className="cross-search-results">
          {query.trim() && results.length === 0 && (
            <div className="cross-search-empty">未找到匹配内容</div>
          )}
          {results.map(r => (
            <button
              key={r.chapterId}
              className="cross-search-item"
              onClick={() => { onNavigate(r.chapterId); onClose(); }}
            >
              <div className="cross-search-chapter">
                {r.chapterTitle}
                <span style={{ marginLeft: 8, fontWeight: 400, opacity: 0.7 }}>{r.matchCount} 处</span>
              </div>
              <div className="cross-search-snippet">{r.snippet}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
