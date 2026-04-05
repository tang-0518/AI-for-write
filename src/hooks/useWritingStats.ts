// =============================================================
// hooks/useWritingStats.ts — 写作统计
// 追踪累计字数、每日字数、AI 接受率
// =============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { kvGet, kvSet } from '../db/index';

export interface DailyRecord {
  date: string;       // YYYY-MM-DD
  wordsAdded: number; // 当天新增字数（仅人工+接受AI）
  aiAccepted: number; // 接受 AI 内容的次数
  aiRejected: number; // 拒绝 AI 内容的次数
}

export interface WritingStats {
  totalWords: number;   // 全书累计总字数（由 chapters 统计）
  todayWords: number;
  avgDailyWords: number;
  aiAcceptRate: number; // 最近 7 天接受率 (0-1)
  history: DailyRecord[];
}

const DB_KEY = 'writing-stats-history';
const TODAY = () => new Date().toISOString().slice(0, 10);
const MAX_HISTORY_DAYS = 90;

function ensureToday(history: DailyRecord[]): DailyRecord[] {
  const today = TODAY();
  if (history.length === 0 || history[0].date !== today) {
    return [{ date: today, wordsAdded: 0, aiAccepted: 0, aiRejected: 0 }, ...history];
  }
  return history;
}

function calcStats(history: DailyRecord[], totalWords: number): WritingStats {
  const today = history[0]?.date === TODAY() ? history[0] : null;
  const todayWords = today?.wordsAdded ?? 0;

  // 最近 7 天日均（含今天）
  const last7 = history.slice(0, 7);
  const daysWithWords = last7.filter(d => d.wordsAdded > 0).length;
  const sumWords = last7.reduce((s, d) => s + d.wordsAdded, 0);
  const avgDailyWords = daysWithWords > 0 ? Math.round(sumWords / daysWithWords) : 0;

  // 最近 7 天 AI 接受率
  const totalAccepted = last7.reduce((s, d) => s + d.aiAccepted, 0);
  const totalDecisions = last7.reduce((s, d) => s + d.aiAccepted + d.aiRejected, 0);
  const aiAcceptRate = totalDecisions > 0 ? totalAccepted / totalDecisions : 0;

  return { totalWords, todayWords, avgDailyWords, aiAcceptRate, history };
}

export function useWritingStats(totalWords: number) {
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    kvGet<DailyRecord[]>(DB_KEY).then(data => {
      const raw = data ?? [];
      setHistory(ensureToday(raw.slice(0, MAX_HISTORY_DAYS)));
      loadedRef.current = true;
    }).catch(() => {
      setHistory(ensureToday([]));
      loadedRef.current = true;
    });
  }, []);

  const persist = useCallback((next: DailyRecord[]) => {
    kvSet(DB_KEY, next).catch(() => {});
  }, []);

  /** 记录人工新增字数（自动保存时调用） */
  const recordWords = useCallback((delta: number) => {
    if (delta <= 0 || !loadedRef.current) return;
    setHistory(prev => {
      const next = ensureToday([...prev]);
      next[0] = { ...next[0], wordsAdded: next[0].wordsAdded + delta };
      persist(next);
      return next;
    });
  }, [persist]);

  /** 记录一次 AI 接受 */
  const recordAiAccepted = useCallback(() => {
    if (!loadedRef.current) return;
    setHistory(prev => {
      const next = ensureToday([...prev]);
      next[0] = { ...next[0], aiAccepted: next[0].aiAccepted + 1 };
      persist(next);
      return next;
    });
  }, [persist]);

  /** 记录一次 AI 拒绝 */
  const recordAiRejected = useCallback(() => {
    if (!loadedRef.current) return;
    setHistory(prev => {
      const next = ensureToday([...prev]);
      next[0] = { ...next[0], aiRejected: next[0].aiRejected + 1 };
      persist(next);
      return next;
    });
  }, [persist]);

  const stats = calcStats(history, totalWords);
  return { stats, recordWords, recordAiAccepted, recordAiRejected };
}
