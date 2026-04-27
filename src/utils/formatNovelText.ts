const SENTENCE_ENDINGS = '。！？';
const TRAILING_QUOTES = '」』"）)';

function splitBySentenceEnd(text: string): string[] {
  const result: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if (!SENTENCE_ENDINGS.includes(text[i])) continue;

    const next = text[i + 1] ?? '';
    if (TRAILING_QUOTES.includes(next)) {
      current += next;
      i++;
    }

    result.push(current.trim());
    current = '';
  }

  if (current.trim()) result.push(current.trim());
  return result.length >= 2 ? result : [text];
}

export function formatNovelText(raw: string): string | null {
  if (!raw.trim()) return null;

  const blocks = raw.split(/\n{2,}/);
  const result: string[] = [];

  for (const block of blocks) {
    const text = block.trim();
    if (!text) continue;

    const rawLines = text.split('\n').map(line => line.trim()).filter(Boolean);

    for (const line of rawLines) {
      const charCount = line.replace(/\s/g, '').length;
      const lines = charCount > 60 ? splitBySentenceEnd(line) : [line];

      for (const nextLine of lines) {
        const trimmed = nextLine.trim();
        if (!trimmed) continue;
        result.push('\u3000\u3000' + trimmed);
        result.push('');
      }
    }
  }

  while (result.length && result[result.length - 1] === '') result.pop();
  return result.join('\n');
}
