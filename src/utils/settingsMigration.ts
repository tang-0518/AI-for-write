// =============================================================
// utils/settingsMigration.ts — 设置字段迁移机制
//
// 每次 AppSettings 结构发生变更，在 MIGRATIONS 中追加一条迁移，
// 并将 SETTINGS_SCHEMA_VERSION 递增。
// App.tsx 在合并 rawSettings 之后调用 migrateSettings()，
// 确保旧版本存档自动补全新字段、转换废弃字段。
// =============================================================

import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from '../types';

type PartialSettings = Partial<AppSettings> & Record<string, unknown>;

interface Migration {
  version: number;   // 升级到此版本时执行
  up: (s: PartialSettings) => void;
}

// ── 迁移列表：按 version 升序排列 ──────────────────────────────
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(s) {
      // v0 → v1：补全所有新增字段的默认值
      if (s.compactTriggerRatio === undefined) s.compactTriggerRatio = DEFAULT_SETTINGS.compactTriggerRatio;
      if (s.memoryTokenBudget   === undefined) s.memoryTokenBudget   = DEFAULT_SETTINGS.memoryTokenBudget;
      if (s.usePrevChapterContext === undefined) s.usePrevChapterContext = DEFAULT_SETTINGS.usePrevChapterContext;
      if (s.wordGoal            === undefined) s.wordGoal            = DEFAULT_SETTINGS.wordGoal;
      if (s.writeLength         === undefined) s.writeLength         = DEFAULT_SETTINGS.writeLength;
      if (s.customPrompt        === undefined) s.customPrompt        = DEFAULT_SETTINGS.customPrompt;
    },
  },
  // 未来新增迁移在此追加，例如：
  // {
  //   version: 2,
  //   up(s) {
  //     // 将废弃的 oldField 映射到 newField
  //     if ('oldField' in s) { s.newField = s.oldField; delete s.oldField; }
  //   },
  // },
];

/**
 * 运行所有尚未执行的迁移，返回迁移后的完整 AppSettings。
 * @param raw 从持久化存储中读到的原始对象（可能缺少新字段）
 */
export function migrateSettings(raw: PartialSettings): AppSettings {
  const current = raw.schemaVersion ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version > current) {
      m.up(raw);
    }
  }

  raw.schemaVersion = SETTINGS_SCHEMA_VERSION;

  // 最终与 DEFAULT_SETTINGS 合并，保证类型完整
  return { ...DEFAULT_SETTINGS, ...raw } as AppSettings;
}
