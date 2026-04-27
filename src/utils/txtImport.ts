// =============================================================
// utils/txtImport.ts - TXT parsing and chapter splitting
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

export function decodeTxt(buffer: ArrayBuffer): { text: string; encoding: string } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { text, encoding: 'UTF-8' };
  } catch {
    try {
      const text = new TextDecoder('gbk').decode(buffer);
      return { text, encoding: 'GBK' };
    } catch {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      return { text, encoding: 'UTF-8 (lossy)' };
    }
  }
}

const CHAPTER_PATTERNS = [
  /^第[零一二三四五六七八九十百千万\d]+[章节回幕篇卷]/,
  /^[Cc]hapter\s*\d+/,
  /^\d{1,4}[.\u3001\uFF0E]\s*[\u4e00-\u9fffA-Za-z]{2}/,
  /^(CHAPTER|PART|SECTION)\s+[IVXLCDM\d]+/i,
];

function isChapterMarker(line: string): boolean {
  const title = line.trim();
  if (title.length === 0 || title.length > 80) return false;
  return CHAPTER_PATTERNS.some(pattern => pattern.test(title));
}

function splitByChapterMarkers(lines: string[]): ParsedChapter[] | null {
  const chapters: ParsedChapter[] = [];
  const prologueLines: string[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (isChapterMarker(line)) {
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
      continue;
    }

    if (!currentTitle) {
      prologueLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    const content = currentLines.join('\n').trim();
    chapters.push({
      title: currentTitle,
      content,
      wordCount: content.replace(/\s/g, '').length,
    });
  }

  if (chapters.length < 2) return null;

  const prologueContent = prologueLines.join('\n').trim();
  const prologueWordCount = prologueContent.replace(/\s/g, '').length;
  if (prologueWordCount > 100) {
    chapters.unshift({
      title: '序章',
      content: prologueContent,
      wordCount: prologueWordCount,
    });
  }

  return chapters.filter(chapter => chapter.wordCount > 0);
}

function chapterTitleByIndex(index: number): string {
  const nums = [
    '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  ];

  return `第${nums[index] ?? index + 1}章`;
}

function splitByParagraphs(text: string, paragraphsPerChapter: number): ParsedChapter[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0);

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

export async function parseTxtBuffer(
  buffer: ArrayBuffer,
  paragraphsPerChapter = 5,
): Promise<ParseResult> {
  const { text, encoding } = decodeTxt(buffer);
  const totalChars = text.replace(/\s/g, '').length;
  const lines = text.split('\n');

  const chaptersByMarker = splitByChapterMarkers(lines);
  if (chaptersByMarker) {
    return {
      chapters: chaptersByMarker,
      encoding,
      totalChars,
      splitStrategy: 'chapter-marker',
    };
  }

  return {
    chapters: splitByParagraphs(text, paragraphsPerChapter),
    encoding,
    totalChars,
    splitStrategy: 'paragraph-group',
  };
}

export function extractTitleFromFilename(filename: string): string {
  return filename
    .replace(/\.txt$/i, '')
    .replace(/[[(\uFF08\u3010].*?[\])\uFF09\u3011]/g, '')
    .trim()
    .slice(0, 60) || '未命名小说';
}
