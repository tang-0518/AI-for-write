// =============================================================
// components/FindReplace.tsx — 查找替换面板
// =============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface FindReplaceProps {
  content: string;
  mode: 'find' | 'replace';
  onClose: () => void;
  onChange: (newContent: string) => void;
  onMatchFocus?: (start: number, end: number) => void;
}

export function FindReplace({ content, mode: initialMode, onClose, onChange, onMatchFocus }: FindReplaceProps) {
  const [mode, setMode] = useState(initialMode);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // 所有匹配位置（useMemo 避免重复计算）
  const allMatches = useMemo((): number[] => {
    if (!findText) return [];
    const positions: number[] = [];
    const src = caseSensitive ? content : content.toLowerCase();
    const needle = caseSensitive ? findText : findText.toLowerCase();
    let idx = src.indexOf(needle);
    while (idx !== -1) {
      positions.push(idx);
      idx = src.indexOf(needle, idx + 1);
    }
    return positions;
  }, [content, findText, caseSensitive]);

  const matchCount = allMatches.length;

  useEffect(() => {
    setCurrentIndex(prev => {
      if (!findText || matchCount === 0) return -1;
      if (prev < 0) return 0;
      return Math.min(prev, matchCount - 1);
    });
  }, [findText, matchCount]);

  // currentIndex 变化时通知 Editor 定位光标
  useEffect(() => {
    if (currentIndex < 0 || !findText || matchCount === 0) return;
    const start = allMatches[currentIndex];
    onMatchFocus?.(start, start + findText.length);
  }, [currentIndex, allMatches, findText, matchCount, onMatchFocus]);

  const findNext = useCallback(() => {
    if (matchCount === 0) return;
    setCurrentIndex(prev => (prev + 1) % matchCount);
  }, [matchCount]);

  const findPrev = useCallback(() => {
    if (matchCount === 0) return;
    setCurrentIndex(prev => (prev - 1 + matchCount) % matchCount);
  }, [matchCount]);

  const handleFindTextChange = useCallback((value: string) => {
    setFindText(value);
    setCurrentIndex(value ? 0 : -1);
  }, []);

  const handleToggleCaseSensitive = useCallback(() => {
    setCaseSensitive(prev => !prev);
    setCurrentIndex(findText ? 0 : -1);
  }, [findText]);

  // 替换当前（index=-1 时自动用 index 0）
  const replaceCurrent = useCallback(() => {
    if (matchCount === 0) return;
    const idx = currentIndex < 0 ? 0 : currentIndex;
    const pos = allMatches[idx];
    const newContent =
      content.slice(0, pos) +
      replaceText +
      content.slice(pos + findText.length);
    onChange(newContent);
    // 替换后定位到下一个（条目数可能减少）
    setCurrentIndex(prev => {
      const nextCount = matchCount - 1;
      if (nextCount === 0) return -1;
      return prev % nextCount;
    });
  }, [allMatches, content, currentIndex, findText, matchCount, onChange, replaceText]);

  // 全部替换
  const replaceAll = useCallback(() => {
    if (matchCount === 0) return;
    const flags = caseSensitive ? 'g' : 'gi';
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newContent = content.replace(new RegExp(escaped, flags), replaceText);
    onChange(newContent);
    setCurrentIndex(-1);
  }, [caseSensitive, content, findText, matchCount, onChange, replaceText]);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); findNext(); }
      if (e.key === 'Enter' && e.shiftKey)  { e.preventDefault(); findPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [findNext, findPrev, onClose]);

  const displayIndex = matchCount > 0 && currentIndex >= 0 ? currentIndex + 1 : (matchCount > 0 ? 1 : 0);

  return (
    <div className="find-replace-bar">
      {/* 模式切换 */}
      <div className="find-replace-tabs">
        <button
          className={`find-tab ${mode === 'find' ? 'find-tab-active' : ''}`}
          onClick={() => setMode('find')}
        >查找</button>
        <button
          className={`find-tab ${mode === 'replace' ? 'find-tab-active' : ''}`}
          onClick={() => setMode('replace')}
        >替换</button>
      </div>

      <div className="find-replace-body">
        {/* 查找行 */}
        <div className="find-row">
          <input
            ref={findInputRef}
            className="find-input"
            placeholder="查找…"
            value={findText}
            onChange={e => handleFindTextChange(e.target.value)}
            spellCheck={false}
          />
          <span className={`find-count ${findText && matchCount === 0 ? 'find-count-empty' : ''}`}>
            {findText ? (matchCount === 0 ? '无结果' : `${displayIndex}/${matchCount}`) : ''}
          </span>
          <button
            className="find-nav-btn"
            onClick={findPrev}
            disabled={matchCount === 0}
            title="上一个 (Shift+Enter)"
          >↑</button>
          <button
            className="find-nav-btn"
            onClick={findNext}
            disabled={matchCount === 0}
            title="下一个 (Enter)"
          >↓</button>
          <button
            className={`find-case-btn ${caseSensitive ? 'find-case-active' : ''}`}
            onClick={handleToggleCaseSensitive}
            title="区分大小写"
          >Aa</button>
        </div>

        {/* 替换行 */}
        {mode === 'replace' && (
          <div className="find-row">
            <input
              className="find-input"
              placeholder="替换为…"
              value={replaceText}
              onChange={e => setReplaceText(e.target.value)}
              spellCheck={false}
            />
            <button
              className="find-action-btn"
              onClick={replaceCurrent}
              disabled={matchCount === 0}
              title="替换当前"
            >替换</button>
            <button
              className="find-action-btn find-action-all"
              onClick={replaceAll}
              disabled={matchCount === 0}
              title="全部替换"
            >全替</button>
          </div>
        )}
      </div>

      <button className="find-close-btn" onClick={onClose} title="关闭 (Esc)">✕</button>
    </div>
  );
}
