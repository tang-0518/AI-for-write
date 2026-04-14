import fs   from "fs/promises";
import path  from "path";

// ── 类型定义 ──────────────────────────────────────────
export interface NovelBible {
  meta: {
    title:       string;
    createdAt:   string;
    lastUpdated: string;
  };
  market?:    { content: string; generatedAt: string };
  worldview?: { content: string; generatedAt: string };
  characters?:{ content: string; generatedAt: string };
  timeline?:  { content: string; generatedAt: string };
  storyArc?:  { content: string; generatedAt: string };
  style?:     { content: string; generatedAt: string };
  outline?:   { content: string; generatedAt: string };
  chapters?:  { content: string; generatedAt: string };
}

type BibleSection = Omit<NovelBible, "meta">;

// ── 路径工具 ──────────────────────────────────────────
function novelsDir(): string {
  return process.env.NOVELS_DIR
    ? path.resolve(process.env.NOVELS_DIR)
    : path.resolve("novels");
}

function bibleFilePath(title: string): string {
  // 用小说名称作为目录，去掉特殊字符
  const safe = title.replace(/[\\/:*?"<>|]/g, "_");
  return path.join(novelsDir(), safe, "bible.json");
}

// ── 核心操作 ──────────────────────────────────────────
export async function readBible(title: string): Promise<NovelBible> {
  const filePath = bibleFilePath(title);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as NovelBible;
  } catch {
    // 不存在则返回空骨架
    return {
      meta: {
        title,
        createdAt:   new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      },
    };
  }
}

export async function writeBible(
  title:   string,
  section: Partial<BibleSection>
): Promise<void> {
  const filePath = bibleFilePath(title);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const current = await readBible(title);
  const updated: NovelBible = {
    ...current,
    ...section,
    meta: { ...current.meta, lastUpdated: new Date().toISOString() },
  };
  await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");
}

/** 把 bible 里已完成的章节汇成一个上下文字符串，供下游工具使用 */
export function buildContext(bible: NovelBible): string {
  const sections: string[] = [];

  if (bible.market)     sections.push(`## 市场评估\n${bible.market.content}`);
  if (bible.worldview)  sections.push(`## 世界观设定\n${bible.worldview.content}`);
  if (bible.characters) sections.push(`## 人物设定\n${bible.characters.content}`);
  if (bible.timeline)   sections.push(`## 时间线\n${bible.timeline.content}`);
  if (bible.storyArc)   sections.push(`## 故事走向\n${bible.storyArc.content}`);
  if (bible.style)      sections.push(`## 文风研究\n${bible.style.content}`);
  if (bible.outline)    sections.push(`## 细纲\n${bible.outline.content}`);

  return sections.length > 0
    ? `以下是该小说已完成的前序资料：\n\n${sections.join("\n\n---\n\n")}`
    : "（暂无前序资料，这是第一步）";
}
