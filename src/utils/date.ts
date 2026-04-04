// =============================================================
// utils/date.ts — 日期与时间格式化工具
// =============================================================

/**
 * 格式化为中文短日期：月/日 时:分
 */
export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化为中文完整日期时间
 */
export function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 相对时间（几秒前、几分前、几小时前、几天前）
 */
export function formatRelativeTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;

  if (diff < 0) return '刚刚';
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatShortDate(ts);
}

/**
 * 格式化为文件名安全的日期字符串：YYYY-MM-DD
 */
export function formatFileDate(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化为 ISO 8601 字符串（用于序列化）
 */
export function formatISODate(ts: number): string {
  return new Date(ts).toISOString();
}

/**
 * 解析日期字符串为时间戳，失败返回 null
 */
export function parseDate(str: string): number | null {
  const ts = Date.parse(str);
  return isNaN(ts) ? null : ts;
}

/**
 * 获取今天的开始时间戳（00:00:00.000）
 */
export function getTodayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 获取本周开始时间戳（周一 00:00:00.000）
 */
export function getWeekStart(): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 获取本月开始时间戳（1号 00:00:00.000）
 */
export function getMonthStart(): number {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 计算两个日期之间的天数差
 */
export function daysBetween(tsA: number, tsB: number): number {
  return Math.abs(Math.floor((tsA - tsB) / 86_400_000));
}

/**
 * 判断时间戳是否在今天
 */
export function isToday(ts: number): boolean {
  return ts >= getTodayStart() && ts < getTodayStart() + 86_400_000;
}

/**
 * 按天分组时间戳数组
 */
export function groupByDay<T extends { createdAt: number }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = formatFileDate(item.createdAt);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

/**
 * 持续时间格式化（毫秒 → 人类可读）
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}
