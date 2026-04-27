import { useEffect, useMemo, useState } from 'react';
import { readGraph } from '../graph/storage';
import type { NovelEntity } from '../graph/types';

interface TimelinePanelProps {
  bookId: string | null | undefined;
}

export function TimelinePanel({ bookId }: TimelinePanelProps) {
  const [events, setEvents] = useState<NovelEntity[]>([]);
  const [sortBy, setSortBy] = useState<'chapter' | 'name'>('chapter');

  useEffect(() => {
    if (!bookId) {
      setEvents([]);
      return;
    }

    readGraph(bookId)
      .then((graph) => {
        const nextEvents = graph.entities
          .filter(entity => entity.type === 'event')
          .sort((a, b) => (
            (a.firstChapter ?? 0) - (b.firstChapter ?? 0)
            || a.name.localeCompare(b.name, 'zh-CN')
          ));
        setEvents(nextEvents);
      })
      .catch(() => {
        setEvents([]);
      });
  }, [bookId]);

  const groupedByChapter = useMemo(() => events.reduce<Record<number, NovelEntity[]>>((acc, event) => {
    const chapter = Math.max(1, event.firstChapter ?? 1);
    acc[chapter] ??= [];
    acc[chapter].push(event);
    return acc;
  }, {}), [events]);

  const chapterKeys = useMemo(
    () => Object.keys(groupedByChapter).map(Number).sort((a, b) => a - b),
    [groupedByChapter],
  );

  const namedEvents = useMemo(
    () => events.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [events],
  );

  if (events.length === 0) {
    return (
      <div className="sp-empty">
        暂无时间线事件
        <br />
        <span style={{ fontSize: 11, opacity: 0.6 }}>完成章节后自动提取</span>
      </div>
    );
  }

  return (
    <div className="sp-panel sp-panel-scroll" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <div className="sp-section-header">
        <span className="sp-section-title">故事时间轴</span>
        <select
          className="ph-select"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as 'chapter' | 'name')}
        >
          <option value="chapter">按章节</option>
          <option value="name">按名称</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sortBy === 'chapter' ? chapterKeys.map((chapter) => (
          <div key={chapter} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              className="sp-section-header"
              style={{ background: 'transparent', paddingTop: 4, paddingBottom: 4 }}
            >
              <span className="sp-section-title">第 {chapter} 章</span>
            </div>
            {groupedByChapter[chapter].map((event) => (
              <div key={event.id} className="sp-item sp-item-accent-blue">
                <div className="sp-item-header">
                  <span className="sp-item-title">{event.name}</span>
                  {event.attributes.timestamp && (
                    <span className="sp-item-meta">{event.attributes.timestamp}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )) : namedEvents.map((event) => (
          <div key={event.id} className="sp-item sp-item-accent-blue">
            <div className="sp-item-header">
              <span className="sp-item-title">{event.name}</span>
              <span className="sp-item-meta">
                第 {Math.max(1, event.firstChapter ?? 1)} 章
                {event.attributes.timestamp ? ` · ${event.attributes.timestamp}` : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimelinePanel;
