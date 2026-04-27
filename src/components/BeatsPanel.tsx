import { useRef, useState } from 'react';
import { useBeats } from '../hooks/useBeats';
import type { BeatFocus } from '../beats/types';
import { BEAT_FOCUS_META } from '../beats/types';
import { buildBeatPrompt } from '../beats/beatEngine';

interface BeatsPanelProps {
  chapterNumber?: number;
  chapterOutline?: string;
  onWriteBeat?: (beatPromptOverride: string) => void;
}

const FOCUS_ACCENT: Record<BeatFocus, string> = {
  hook: 'sp-item-accent-purple',
  dialogue: 'sp-item-accent-blue',
  action: 'sp-item-accent-red',
  emotion: 'sp-item-accent-yellow',
  sensory: 'sp-item-accent-green',
  suspense: 'sp-item-accent-red',
  character_intro: 'sp-item-accent-blue',
};

export function BeatsPanel({ chapterNumber = 1, chapterOutline = '', onWriteBeat }: BeatsPanelProps) {
  const {
    beats,
    activeBeatIdx,
    progress,
    allDone,
    generateBeats,
    addBeat,
    removeBeat,
    reorderBeats,
    completeBeat,
    clearBeats,
    setActiveBeatIdx,
  } = useBeats();

  const [chNum, setChNum] = useState(chapterNumber);
  const [outline, setOutline] = useState(chapterOutline);
  const [targetWords, setTargetWords] = useState(3000);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFocus, setNewFocus] = useState<BeatFocus>('action');
  const [newDesc, setNewDesc] = useState('');
  const [newWords, setNewWords] = useState(500);

  const dragIdx = useRef<number | null>(null);

  function handleGenerate() {
    generateBeats(chNum, outline, targetWords);
  }

  function handleAddBeat() {
    if (!newDesc.trim()) return;
    addBeat(newFocus, newDesc.trim(), newWords);
    setNewDesc('');
    setShowAddForm(false);
  }

  function handleWriteBeat(idx: number) {
    const beat = beats[idx];
    if (!beat || !onWriteBeat) return;
    setActiveBeatIdx(idx);
    onWriteBeat(buildBeatPrompt(beat, idx, beats.length));
  }

  function handleDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function handleDrop(toIdx: number) {
    if (dragIdx.current === null || dragIdx.current === toIdx) return;
    reorderBeats(dragIdx.current, toIdx);
    dragIdx.current = null;
  }

  function handleCompleteBeat(id: string) {
    completeBeat(id, '');
  }

  return (
    <div className="beats-panel sp-panel sp-panel-scroll">
      <div className="sp-section-header">
        <span className="sp-section-title">章节节拍</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {beats.length > 0 && <span className="sp-section-badge">{beats.length} 节拍</span>}
          {beats.length > 0 && (
            <button className="btn btn-ghost" onClick={clearBeats} type="button">
              清空
            </button>
          )}
        </div>
      </div>

      {beats.length > 0 && (
        <div className="beats-panel-progress-bar">
          <div className="beats-panel-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      <div className="beats-panel-gen">
        <input
          className="sp-input"
          type="number"
          min={1}
          style={{ width: 64 }}
          value={chNum}
          onChange={e => setChNum(Number(e.target.value))}
          placeholder="章节号"
          title="章节号"
        />
        <input
          className="sp-input"
          style={{ flex: 1 }}
          value={outline}
          onChange={e => setOutline(e.target.value)}
          placeholder="章节大纲（可选）"
        />
        <input
          className="sp-input"
          type="number"
          min={500}
          step={500}
          style={{ width: 84 }}
          value={targetWords}
          onChange={e => setTargetWords(Number(e.target.value))}
          placeholder="目标字数"
          title="目标字数"
        />
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerate} type="button">
          生成节拍
        </button>
      </div>

      {beats.length > 0 ? (
        <div className="beats-panel-list">
          {beats.map((beat, idx) => {
            const meta = BEAT_FOCUS_META[beat.focus];
            const isActive = idx === activeBeatIdx;
            const isDone = beat.status === 'done';

            return (
              <div
                key={beat.id}
                className={`sp-item ${FOCUS_ACCENT[beat.focus]} ${isActive ? 'sp-item-active' : ''} ${isDone ? 'sp-item-done' : ''}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                title={meta.hint}
              >
                <div className="sp-item-header">
                  <span className="beats-item-dot" style={{ backgroundColor: meta.color }} />
                  <span className="sp-item-meta">{idx + 1}/{beats.length}</span>
                  <span className="sp-item-title">{beat.description}</span>
                  <span className="sp-item-meta">{beat.targetWords} 字</span>
                </div>
                <div className="sp-item-desc">{meta.label}</div>
                <div className="sp-item-actions">
                  {!isDone && onWriteBeat && (
                    <button
                      className="btn btn-primary ph-action-btn"
                      onClick={() => handleWriteBeat(idx)}
                      type="button"
                    >
                      写
                    </button>
                  )}
                  <button
                    className="btn btn-ghost ph-action-btn"
                    onClick={() => handleCompleteBeat(beat.id)}
                    type="button"
                    disabled={isDone}
                  >
                    {isDone ? '已完成' : '完成'}
                  </button>
                  <button
                    className="btn btn-ghost ph-action-btn"
                    onClick={() => removeBeat(beat.id)}
                    type="button"
                  >
                    移除
                  </button>
                </div>
              </div>
            );
          })}
          {allDone && (
            <div className="sp-empty">所有节拍已完成，可以清空后重新生成，或继续手动补充。</div>
          )}
        </div>
      ) : (
        <div className="sp-empty">填写章节号和大纲后，点击“生成节拍”开始。</div>
      )}

      <div className="beats-panel-add">
        {showAddForm ? (
          <div className="beats-add-form">
            <select
              className="ph-select"
              value={newFocus}
              onChange={e => setNewFocus(e.target.value as BeatFocus)}
            >
              {(Object.keys(BEAT_FOCUS_META) as BeatFocus[]).map(focus => (
                <option key={focus} value={focus}>
                  {BEAT_FOCUS_META[focus].label}
                </option>
              ))}
            </select>
            <input
              className="sp-input"
              style={{ flex: 1 }}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="节拍描述"
            />
            <input
              className="sp-input"
              type="number"
              min={100}
              step={100}
              style={{ width: 84 }}
              value={newWords}
              onChange={e => setNewWords(Number(e.target.value))}
              placeholder="字数"
            />
            <div className="sp-item-actions" style={{ width: '100%', marginTop: 0 }}>
              <button className="btn btn-primary" onClick={handleAddBeat} type="button">
                添加
              </button>
              <button className="btn btn-ghost" onClick={() => setShowAddForm(false)} type="button">
                取消
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => setShowAddForm(true)} type="button">
            + 添加节拍
          </button>
        )}
      </div>
    </div>
  );
}

export default BeatsPanel;
