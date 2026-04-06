// =============================================================
// utils/txtImport.ts — TXT 文件解析与自动分章
// =============================================================

export interface ParsedChapter {
  title: string;
  content: string;
  wordCount: number;
}

export interface ParseResult {
  chapters: ParsedChapter[];
  encoding: string;
  totalChars: number;
  splitStrategy: 'chapter-marker' | 'paragraph-group';
}

// ── 编码检测与解码 ─────────────────────────────────────────────

export function decodeTxt(buffer: ArrayBuffer): { text: string; encoding: string } {
  // 优先 UTF-8（strict 模式：无效字节直接抛异常）
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { text, encoding: 'UTF-8' };
  } catch {
    // UTF-8 失败，回退到 GBK（兼容老式中文 TXT）
    try {
      const text = new TextDecoder('gbk').decode(buffer);
      return { text, encoding: 'GBK' };
    } catch {
      // 最后兜底：忽略错误的 UTF-8
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      return { text, encoding: 'UTF-8 (lossy)' };
    }
  }
}

// ── 章节标记正则（按优先级排列） ──────────────────────────────

const CHAPTER_PATTERNS = [
  // 中文数字章节：第一章、第〇二节、第一百零一回、第1章
  /^第[〇零一二三四五六七八九十百千万\d]+[章节回幕篇卷]/,
  // 纯阿拉伯/中文混合：Chapter 1、chapter1
  /^[Cc]hapter\s*\d+/,
  // 数字加标点序号：1. 2、 3．（行首，后跟至少2个非空字符，避免句号误判）
  /^\d{1,4}[\.、．]\s*[\u4e00-\u9fffA-Za-z]{2}/,
  // 全大写数字章节 (英文书)
  /^(CHAPTER|PART|SECTION)\s+[IVXLCDM\d]+/i,
];

function isChapterMarker(line: string): boolean {
  const t = line.trim();
  // 空行或超长行（正文段落）不是章节标题
  if (t.length === 0 || t.length > 80) return false;
  return CHAPTER_PATTERNS.some(p => p.test(t));
}

// ── 按章节标记分割 ─────────────────────────────────────────────

function splitByChapterMarkers(lines: string[]): ParsedChapter[] | null {
  const chapters: ParsedChapter[] = [];
  // 序章：第一个章节标记之前的内容
  let prologueLines: string[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (isChapterMarker(line)) {
      // 保存上一章（若有内容）
      if (currentTitle) {
        const content = currentLines.join('\n').trim();
        chapters.push({
          title: currentTitle,
          content,
          wordCount: content.replace(/\s/g, '').length,
        });
      }
      currentTitle = line.trim().slice(0, 80);
      currentLines = [];
    } else {
      if (!currentTitle) {
        // 第一个章节标记前的内容收入序章
        prologueLines.push(line);
      } else {
        currentLines.push(line);
      }
    }
  }

  // 最后一章
  if (currentTitle) {
    const content = currentLines.join('\n').trim();
    chapters.push({
      title: currentTitle,
      content,
      wordCount: content.replace(/\s/g, '').length,
    });
  }

  // 少于 2 章说明没有有效标记
  if (chapters.length < 2) return null;

  // 前置序章（超过 100 字才作为独立章节，否则丢弃）
  const prologueContent = prologueLines.join('\n').trim();
  const prologueWordCount = prologueContent.replace(/\s/g, '').length;
  if (prologueWordCount > 100) {
    chapters.unshift({
      title: '序章',
      content: prologueContent,
      wordCount: prologueWordCount,
    });
  }

  // 过滤掉空章节（两个章节标题相邻时会产生）
  return chapters.filter(c => c.wordCount > 0);
}

// ── 按段落数分章（无标记时的兜底策略） ───────────────────────

function chapterTitleByIndex(index: number): string {
  const nums = ['一','二','三','四','五','六','七','八','九','十',
                '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十'];
  return `第${nums[index] ?? (index + 1)}章`;
}

function splitByParagraphs(text: string, paragraphsPerChapter: number): ParsedChapter[] {
  // 按空行分割成段落
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (paragraphs.length === 0) {
    return [{
      title: chapterTitleByIndex(0),
      content: text.trim(),
      wordCount: text.replace(/\s/g, '').length,
    }];
  }

  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < paragraphs.length; i += paragraphsPerChapter) {
    const chunk = paragraphs.slice(i, i + paragraphsPerChapter);
    const content = chunk.join('\n\n');
    chapters.push({
      title: chapterTitleByIndex(chapters.length),
      content,
      wordCount: content.replace(/\s/g, '').length,
    });
  }
  return chapters;
}

// ── 主入口 ────────────────────────────────────────────────────

export async function parseTxtBuffer(
  buffer: ArrayBuffer,
  paragraphsPerChapter = 5,
): Promise<ParseResult> {
  const { text, encoding } = decodeTxt(buffer);
  const totalChars = text.replace(/\s/g, '').length;
  const lines = text.split('\n');

  // 尝试章节标记分章
  const byMarker = splitByChapterMarkers(lines);
  if (byMarker) {
    return {
      chapters: byMarker,
      encoding,
      totalChars,
      splitStrategy: 'chapter-marker',
    };
  }

  // 兜底：按段落数分章
  const byParagraph = splitByParagraphs(text, paragraphsPerChapter);
  return {
    chapters: byParagraph,
    encoding,
    totalChars,
    splitStrategy: 'paragraph-group',
  };
}

// 从文件名提取书名（去掉扩展名和常见标记）
export function extractTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.(txt|TXT)$/, '')
    .replace(/[\[\(（【].*?[\]\)）】]/g, '')
    .trim()
    .slice(0, 60) || '未命名小说';
}
