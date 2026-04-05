// =============================================================
// hooks/useFocusTimer.ts — 专注模式番茄钟
// =============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

export type TimerPhase = 'idle' | 'work' | 'break' | 'paused';

export interface FocusTimerState {
  phase: TimerPhase;
  secondsLeft: number;
  pomodoroCount: number;   // 已完成的番茄数
  sessionWords: number;    // 本次专注新增字数
  pausedPhase: TimerPhase | null;
}

const WORK_SECONDS  = 25 * 60;
const BREAK_SECONDS =  5 * 60;

export function useFocusTimer(currentWordCount: number) {
  const [phase, setPhase]         = useState<TimerPhase>('idle');
  const [secondsLeft, setSeconds] = useState(WORK_SECONDS);
  const [pomodoroCount, setCount] = useState(0);
  const [baselineWords, setBaseline] = useState(currentWordCount);
  const pausedPhaseRef = useRef<TimerPhase | null>(null);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionWords = Math.max(0, currentWordCount - baselineWords);

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startTick = useCallback((onExpire: () => void) => {
    clearTick();
    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startWork = useCallback(() => {
    setPhase('work');
    setSeconds(WORK_SECONDS);
    setBaseline(currentWordCount);
    pausedPhaseRef.current = null;
  }, [currentWordCount]);

  const startBreak = useCallback(() => {
    setPhase('break');
    setSeconds(BREAK_SECONDS);
    pausedPhaseRef.current = null;
  }, []);

  const pause = useCallback(() => {
    if (phase !== 'work' && phase !== 'break') return;
    pausedPhaseRef.current = phase;
    setPhase('paused');
    clearTick();
  }, [phase]);

  const resume = useCallback(() => {
    if (phase !== 'paused') return;
    const resumed = pausedPhaseRef.current ?? 'work';
    setPhase(resumed);
  }, [phase]);

  const stop = useCallback(() => {
    clearTick();
    setPhase('idle');
    setSeconds(WORK_SECONDS);
    setCount(0);
    setBaseline(currentWordCount);
    pausedPhaseRef.current = null;
  }, [currentWordCount]);

  // tick 驱动：phase 变化时重新绑定
  useEffect(() => {
    if (phase === 'work') {
      startTick(() => {
        clearTick();
        setCount(c => c + 1);
        setPhase('break');
        setSeconds(BREAK_SECONDS);
        // 短暂 break 自动结束后需要新 effect 启动
      });
    } else if (phase === 'break') {
      startTick(() => {
        clearTick();
        setPhase('work');
        setSeconds(WORK_SECONDS);
      });
    } else {
      clearTick();
    }
    return clearTick;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return clearTick;
  }, []);

  const state: FocusTimerState = {
    phase,
    secondsLeft,
    pomodoroCount,
    sessionWords,
    pausedPhase: pausedPhaseRef.current,
  };

  return { state, startWork, startBreak, pause, resume, stop };
}
