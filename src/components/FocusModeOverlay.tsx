// =============================================================
// components/FocusModeOverlay.tsx — 专注模式覆盖层（番茄钟）
// =============================================================

import type { FocusTimerState } from '../hooks/useFocusTimer';

interface FocusModeOverlayProps {
  timerState: FocusTimerState;
  onStartWork: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onExitFocus: () => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatTime(seconds: number) {
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

export function FocusModeOverlay({
  timerState,
  onStartWork,
  onPause,
  onResume,
  onStop,
  onExitFocus,
}: FocusModeOverlayProps) {
  const { phase, secondsLeft, pomodoroCount, sessionWords } = timerState;

  const phaseLabel = phase === 'work'   ? '🍅 专注中'
                   : phase === 'break'  ? '☕ 休息中'
                   : phase === 'paused' ? '⏸ 已暂停'
                   : '准备专注';

  const phaseClass = `focus-timer-phase focus-timer-phase--${phase}`;

  return (
    <div className="focus-overlay">
      {/* 退出按钮 */}
      <button className="focus-exit-btn" onClick={onExitFocus} title="退出专注模式">
        ↗ 退出专注
      </button>

      {/* 番茄钟卡片 */}
      <div className="focus-timer-card">
        <div className={phaseClass}>{phaseLabel}</div>

        <div className="focus-timer-display">
          {formatTime(secondsLeft)}
        </div>

        <div className="focus-timer-stats">
          <span>🍅 × {pomodoroCount}</span>
          <span>✍️ +{sessionWords} 字</span>
        </div>

        <div className="focus-timer-controls">
          {phase === 'idle' && (
            <button className="btn btn-primary focus-ctrl-btn" onClick={onStartWork}>
              开始专注
            </button>
          )}
          {phase === 'work' && (
            <>
              <button className="btn btn-ghost focus-ctrl-btn" onClick={onPause}>
                暂停
              </button>
              <button className="btn btn-ghost focus-ctrl-btn" onClick={onStop}>
                结束
              </button>
            </>
          )}
          {phase === 'break' && (
            <>
              <button className="btn btn-ghost focus-ctrl-btn" onClick={onPause}>
                暂停
              </button>
              <button className="btn btn-primary focus-ctrl-btn" onClick={onStartWork}>
                跳过休息
              </button>
            </>
          )}
          {phase === 'paused' && (
            <>
              <button className="btn btn-primary focus-ctrl-btn" onClick={onResume}>
                继续
              </button>
              <button className="btn btn-ghost focus-ctrl-btn" onClick={onStop}>
                结束
              </button>
            </>
          )}
        </div>

        {phase === 'work' && secondsLeft <= 60 && (
          <div className="focus-timer-warning">⏰ 还有 {secondsLeft} 秒！</div>
        )}
        {phase === 'break' && (
          <div className="focus-timer-hint">休息一下，喝杯水 ☕</div>
        )}
      </div>
    </div>
  );
}
