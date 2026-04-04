// =============================================================
// utils/id.ts — 唯一 ID 生成工具
// =============================================================

/**
 * 生成加密安全的 UUID v4
 * 优先使用 crypto.randomUUID（现代浏览器支持），降级为手动实现
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 降级实现：使用 crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // 设置版本 4 和变体位
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  }
  // 最终降级：Math.random（不推荐用于生产，仅作兜底）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * 生成短 ID（8位十六进制，用于非关键场景）
 */
export function generateShortId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

/**
 * 生成带前缀的 ID（如 'ver_abc12345'）
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${generateShortId()}`;
}

/**
 * 生成基于时间戳的有序 ID（适合排序场景）
 * 格式：时间戳(ms) + 随机后缀
 */
export function generateOrderedId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${ts}${rand}`;
}

/**
 * 检验字符串是否为有效的 UUID v4 格式
 */
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
