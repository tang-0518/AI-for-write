// src/components/AutopilotPanel.tsx — 自动驾驶控制面板

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Book } from '../types';
import {
  startAutopilot,
  stopAutopilot,
  resumeAutopilot,
  getAutopilotStatus,
  subscribeAutopilotEvents,
  type AutopilotStatus,
} from '../api/autopilot';

const STAGE_LABELS: Record<string, string> = {
  planning: '初始规划',
  macro_planning: '宏观规划',
  act_planning: '幕级规划',
  writing: '写作中',
  paused_for_review: '待审阅',
  completed: '已完成',
};

const STATUS_COLORS: Record<string, string> = {
  running: 'ap-badge--running',
  stopped: 'ap-badge--stopped',
  paused_for_review: 'ap-badge--review',
  error: 'ap-badge--error',
  completed: 'ap-badge--done',
};

interface Props {
  book: Book | null;
}

export function AutopilotPanel({ book }: Props) {
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [maxChapters, setMaxChapters] = useState(9999);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const novelId = book?.id ?? '';

  // 初始加载状态 + 检查后端连通性
  useEffect(() => {
    if (!novelId) return;
    getAutopilotStatus(novelId).then(s => {
      setBackendOk(s !== null || true); // null = 404 (novel not synced), still backend ok
      if (s) setStatus(s);
    }).catch(() => setBackendOk(false));
  }, [novelId]);

  // 订阅 SSE 事件流
  const startSubscription = useCallback(() => {
    if (!novelId) return;
    unsubRef.current?.();
    unsubRef.current = subscribeAutopilotEvents(
      novelId,
      (data) => setStatus(prev => ({ ...(prev ?? {} as AutopilotStatus), ...data })),
      () => setBackendOk(false),
    );
  }, [novelId]);

  useEffect(() => {
    if (status?.autopilot_status === 'running' || status?.autopilot_status === 'paused_for_review') {
      startSubscription();
    } else {
      unsubRef.current?.();
      unsubRef.current = null;
    }
    return () => { unsubRef.current?.(); };
  }, [status?.autopilot_status, startSubscription]);

  useEffect(() => () => { unsubRef.current?.(); }, []);

  const handleStart = async () => {
    if (!book) return;
    setLoading(true); setErrMsg('');
    const res = await startAutopilot(novelId, book, maxChapters);
    setLoading(false);
    if (!res?.success) { setErrMsg(res?.message ?? '启动失败'); return; }
    startSubscription();
    const s = await getAutopilotStatus(novelId);
    if (s) setStatus(s);
  };

  const handleStop = async () => {
    setLoading(true); setErrMsg('');
    await stopAutopilot(novelId);
    setLoading(false);
    const s = await getAutopilotStatus(novelId);
    if (s) setStatus(s);
  };

  const handleResume = async () => {
    setLoading(true); setErrMsg('');
    const res = await resumeAutopilot(novelId);
    setLoading(false);
    if (!res?.success) { setErrMsg(res?.message ?? '恢复失败'); return; }
    startSubscription();
    const s = await getAutopilotStatus(novelId);
    if (s) setStatus(s);
  };

  if (!book) {
    return <div className="ap-empty">请先选择一本书</div>;
  }

  const isRunning = status?.autopilot_status === 'running';
  const needsReview = status?.needs_review ?? status?.autopilot_status === 'paused_for_review';
  const isStopped = !isRunning && !needsReview;

  return (
    <div className="ap-panel">
      <div className="ap-header">
        <span className="ap-title">自动驾驶</span>
        {status && (
          <span className={`ap-badge ${STATUS_COLORS[status.autopilot_status] ?? 'ap-badge--stopped'}`}>
            {status.autopilot_status === 'running' ? '运行中'
              : status.autopilot_status === 'paused_for_review' ? '待审阅'
              : status.autopilot_status === 'completed' ? '已完成'
              : '已停止'}
          </span>
        )}
      </div>

      {/* 进度 */}
      {status && (
        <div className="ap-progress-section">
          <div className="ap-progress-label">
            <span>{STAGE_LABELS[status.current_stage] ?? status.current_stage}</span>
            <span>{status.completed_chapters} / {status.target_chapters} 章</span>
          </div>
          <div className="ap-progress-bar">
            <div className="ap-progress-fill" style={{ width: `${Math.min(status.progress_pct, 100)}%` }} />
          </div>
          <div className="ap-stats">
            <span>累计 {status.total_words.toLocaleString()} 字</span>
            {status.consecutive_error_count > 0 && (
              <span className="ap-error-count">连续错误 {status.consecutive_error_count} 次</span>
            )}
          </div>
          {status.last_chapter_audit?.drift_alert && (
            <div className="ap-drift-alert">⚠ 文风漂移警告</div>
          )}
        </div>
      )}

      {/* 审阅提示 */}
      {needsReview && (
        <div className="ap-review-banner">
          已完成阶段规划，请确认后继续生成
        </div>
      )}

      {/* 控制按钮 */}
      <div className="ap-controls">
        {needsReview && (
          <button className="ap-btn ap-btn--primary" disabled={loading} onClick={handleResume}>
            {loading ? '处理中…' : '确认并继续'}
          </button>
        )}
        {isRunning && (
          <button className="ap-btn ap-btn--danger" disabled={loading} onClick={handleStop}>
            {loading ? '处理中…' : '停止'}
          </button>
        )}
        {isStopped && (
          <>
            <div className="ap-config-row">
              <label className="ap-config-label">最多生成</label>
              <input
                type="number"
                className="ap-config-input"
                min={1} max={9999}
                value={maxChapters === 9999 ? '' : maxChapters}
                placeholder="不限"
                onChange={e => setMaxChapters(e.target.value ? Number(e.target.value) : 9999)}
              />
              <span className="ap-config-unit">章</span>
            </div>
            <button className="ap-btn ap-btn--primary" disabled={loading} onClick={handleStart}>
              {loading ? '启动中…' : '启动自动驾驶'}
            </button>
          </>
        )}
      </div>

      {errMsg && <div className="ap-error">{errMsg}</div>}

      {backendOk === false && (
        <div className="ap-offline">
          后端未运行，请先启动 backend（端口 8005）
        </div>
      )}
    </div>
  );
}
