// =============================================================
// components/StatsPanel.tsx — 写作统计仪表盘
// =============================================================

import type { WritingStats } from '../hooks/useWritingStats';

interface StatsPanelProps {
  stats: WritingStats;
  onClose: () => void;
}

function Bar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="stats-bar-track">
      <div
        className="stats-bar-fill"
        style={{ width: `${Math.min(100, Math.round(ratio * 100))}%`, background: color }}
      />
    </div>
  );
}

export function StatsPanel({ stats, onClose }: StatsPanelProps) {
  const { totalWords, todayWords, avgDailyWords, aiAcceptRate, history } = stats;
  const last7 = history.slice(0, 7);
  const maxDay = Math.max(...last7.map(d => d.wordsAdded), 1);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel stats-panel"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">📊 写作统计</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="stats-body">
          {/* 顶部概览 */}
          <div className="stats-overview">
            <div className="stats-card">
              <div className="stats-card-value">{totalWords.toLocaleString()}</div>
              <div className="stats-card-label">全书总字数</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value stats-today">{todayWords.toLocaleString()}</div>
              <div className="stats-card-label">今日新增</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">{avgDailyWords.toLocaleString()}</div>
              <div className="stats-card-label">近 7 日日均</div>
            </div>
            <div className="stats-card">
              <div className="stats-card-value">
                {aiAcceptRate > 0 ? `${Math.round(aiAcceptRate * 100)}%` : '—'}
              </div>
              <div className="stats-card-label">AI 接受率</div>
              {aiAcceptRate > 0 && (
                <Bar ratio={aiAcceptRate} color="var(--purple-500)" />
              )}
            </div>
          </div>

          {/* 近 7 天柱状图 */}
          {last7.length > 0 && (
            <div className="stats-section">
              <div className="stats-section-title">近 7 天字数</div>
              <div className="stats-chart">
                {last7.map(d => (
                  <div key={d.date} className="stats-chart-col">
                    <div className="stats-chart-bar-wrap">
                      <div
                        className="stats-chart-bar"
                        style={{ height: `${Math.max(4, Math.round((d.wordsAdded / maxDay) * 80))}px` }}
                        title={`${d.date}: ${d.wordsAdded} 字`}
                      />
                    </div>
                    <div className="stats-chart-label">{d.date.slice(5)}</div>
                    <div className="stats-chart-val">{d.wordsAdded > 0 ? d.wordsAdded : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI 互动数据 */}
          {last7.some(d => d.aiAccepted + d.aiRejected > 0) && (
            <div className="stats-section">
              <div className="stats-section-title">AI 互动（近 7 天）</div>
              <div className="stats-ai-row">
                <span>✅ 接受</span>
                <span className="stats-ai-val">{last7.reduce((s, d) => s + d.aiAccepted, 0)} 次</span>
              </div>
              <div className="stats-ai-row">
                <span>✕ 拒绝</span>
                <span className="stats-ai-val">{last7.reduce((s, d) => s + d.aiRejected, 0)} 次</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
