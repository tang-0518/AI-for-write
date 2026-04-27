import { callGemini, withNoThinking } from '../api/gemini';
import type { AppSettings } from '../types';
import type { ChapterStateExtracted } from './types';
import { generateId } from '../utils/id';

const STATE_EXTRACTION_SYSTEM = `你是专业的小说内容分析助手。从章节内容中提取结构化信息。
返回纯 JSON 对象，根对象只允许以下九个键，不要增加其他字段：

1. new_characters: 新出现的角色，每项含 name(string)、description(string)、first_appearance(number)
2. character_actions: 角色行为，每项含 character_name(string)、action(string)
3. relationship_changes: 关系变化，每项含 char1、char2、old_type、new_type（均为 string）
4. foreshadowing_planted: 本章埋下的伏笔，每项含 description(string)、suggested_resolve_chapter(number|null)
5. foreshadowing_resolved: 本章解决的伏笔描述列表（string[]，描述要精准，便于匹配已有伏笔）
6. events: 关键事件，每项含 type(string)、description(string)、involved_characters(string[])
7. timeline_events: 时间线事件，每项含 event(string)、timestamp(string)、timestamp_type("absolute"|"relative"|"vague")
   仅提取文中明确或隐含的时间信息，不要臆造
8. advanced_storylines: 本章推进的已有故事线，每项含 name(string)、progress_summary(string)
9. new_storylines: 本章引入的新故事线，每项含 name、type("main"|"sub"|"hidden")、description
   只在真正开启新线索时提取，不要过度解读

只返回一个 JSON 对象，不要 markdown 代码块，不要前后解释文字。`;

export async function extractChapterState(
  content: string,
  chapterNumber: number,
  settings: AppSettings,
): Promise<ChapterStateExtracted | null> {
  if (!settings.apiKey || content.trim().length < 100) return null;

  let raw: string;
  try {
    raw = await callGemini(
      settings.apiKey,
      settings.model,
      `${STATE_EXTRACTION_SYSTEM}\n\n请从以下第 ${chapterNumber} 章内容中提取结构化信息：\n\n${content.slice(0, 8000)}`,
      withNoThinking(settings.model, { temperature: 0.1, maxOutputTokens: 3000 }),
    );
  } catch {
    return null;
  }

  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s !== -1 && e > s) {
      try { data = JSON.parse(cleaned.slice(s, e + 1)) as Record<string, unknown>; } catch { /* ignore */ }
    }
  }
  if (!data) return null;

  const arr = <T>(key: string): T[] => Array.isArray(data![key]) ? data![key] as T[] : [];

  return {
    newCharacters: arr<Record<string, unknown>>('new_characters').map(c => ({
      name:            String(c['name'] ?? ''),
      description:     String(c['description'] ?? ''),
      firstAppearance: Number(c['first_appearance'] ?? chapterNumber),
    })),
    characterActions: arr<Record<string, unknown>>('character_actions').map(a => ({
      characterName: String(a['character_name'] ?? a['character_id'] ?? ''),
      action:        String(a['action'] ?? ''),
    })),
    relationshipChanges: arr<Record<string, unknown>>('relationship_changes').map(r => ({
      char1:   String(r['char1'] ?? ''),
      char2:   String(r['char2'] ?? ''),
      oldType: String(r['old_type'] ?? ''),
      newType: String(r['new_type'] ?? ''),
    })),
    foreshadowingPlanted: arr<Record<string, unknown>>('foreshadowing_planted').map(f => ({
      id:                   generateId(),
      description:          String(f['description'] ?? ''),
      plantedChapter:       chapterNumber,
      suggestedResolveChapter: f['suggested_resolve_chapter'] != null
        ? Number(f['suggested_resolve_chapter'])
        : undefined,
      status: 'planted' as const,
    })),
    foreshadowingResolved: arr<string>('foreshadowing_resolved'),
    timelineEvents: arr<Record<string, unknown>>('timeline_events').map(t => ({
      event:         String(t['event'] ?? ''),
      timestamp:     String(t['timestamp'] ?? ''),
      timestampType: (['absolute','relative','vague'].includes(String(t['timestamp_type']))
        ? t['timestamp_type'] : 'vague') as 'absolute' | 'relative' | 'vague',
      chapter:       chapterNumber,
    })),
    newStorylines: arr<Record<string, unknown>>('new_storylines').map(s => ({
      name:              String(s['name'] ?? ''),
      type:              (['main','sub','hidden'].includes(String(s['type'])) ? s['type'] : 'sub') as 'main'|'sub'|'hidden',
      description:       String(s['description'] ?? ''),
      introducedChapter: chapterNumber,
    })),
    advancedStorylines: arr<Record<string, unknown>>('advanced_storylines').map(s => ({
      name:            String(s['name'] ?? s['storyline_name'] ?? ''),
      progressSummary: String(s['progress_summary'] ?? ''),
    })),
  };
}
