import { upsertEntities, upsertRelations } from '../graph/storage';
import { upsertMemoryAsync } from '../memory/storage';
import type { ChapterStateExtracted, ForeshadowingItem } from './types';

async function saveNewCharacters(
  chars: ChapterStateExtracted['newCharacters'],
  bookId: string,
): Promise<void> {
  if (chars.length === 0) return;
  await upsertEntities(bookId, chars.map(c => ({
    name:         c.name,
    type:         'character' as const,
    attributes:   { description: c.description },
    observations: [`首次出现于第 ${c.firstAppearance} 章`],
    firstChapter: c.firstAppearance,
    tags:         ['新角色'],
    source:       'auto_extract' as const,
  })));
}

async function saveRelationChanges(
  changes: ChapterStateExtracted['relationshipChanges'],
  bookId: string,
  chapterOrder: number,
): Promise<void> {
  if (changes.length === 0) return;
  await upsertRelations(bookId, changes.map(c => ({
    from:         c.char1,
    to:           c.char2,
    relationType: `${c.oldType}→${c.newType}`,
    weight:       0.8,
    chapter:      chapterOrder,
    source:       'auto_extract' as const,
  })));
}

async function saveForeshadowings(
  items: ForeshadowingItem[],
  bookId: string,
): Promise<void> {
  for (const f of items) {
    await upsertMemoryAsync({
      name:         f.description.slice(0, 20),
      description:  `埋于第 ${f.plantedChapter} 章` + (f.suggestedResolveChapter ? `，预计第 ${f.suggestedResolveChapter} 章回收` : ''),
      type:         'plot_hook',
      content:      f.description,
      bookId,
      autoExtracted: true,
      chapterOrder:  f.plantedChapter,
      id:           f.id,
    });
  }
}

async function saveTimelineEvents(
  events: ChapterStateExtracted['timelineEvents'],
  bookId: string,
): Promise<void> {
  if (events.length === 0) return;
  await upsertEntities(bookId, events.map(e => ({
    name:         e.event.slice(0, 30),
    type:         'event' as const,
    attributes:   { timestamp: e.timestamp, timestampType: e.timestampType },
    observations: [`第 ${e.chapter} 章发生`],
    firstChapter: e.chapter,
    tags:         ['时间线'],
    source:       'auto_extract' as const,
  })));
}

export async function persistChapterState(
  state: ChapterStateExtracted,
  bookId: string,
  chapterOrder: number,
): Promise<void> {
  await Promise.all([
    saveNewCharacters(state.newCharacters, bookId),
    saveRelationChanges(state.relationshipChanges, bookId, chapterOrder),
    saveForeshadowings(state.foreshadowingPlanted, bookId),
    saveTimelineEvents(state.timelineEvents, bookId),
  ]);
}
