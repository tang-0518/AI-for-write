// =============================================================
// hooks/useStorage.ts — 通用 localStorage 读写 Hook
//
// React 自定义 Hook 命名规范：必须以 "use" 开头
// 泛型 <T>：让这个 Hook 可以存储任意类型的数据
// =============================================================

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

/**
 * useStorage — 带持久化的状态 Hook
 *
 * @param key          - localStorage 的键名
 * @param defaultValue - 当 localStorage 中没有数据时的默认值
 * @returns [当前值, 更新函数] — 与 useState 返回值完全一致
 *
 * 使用示例：
 *   const [name, setName] = useStorage('user-name', '匿名');
 */
export function useStorage<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  // useState 的初始化函数（只在组件首次挂载时执行一次）
  // 从 localStorage 读取已保存的值，解析 JSON；失败则使用默认值
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      // item 为 null 说明从未保存过，使用 defaultValue
      return item !== null ? (JSON.parse(item) as T) : defaultValue;
    } catch {
      // JSON.parse 失败（数据损坏）时，静默回退到默认值
      return defaultValue;
    }
  });

  // useEffect：副作用 — 每当 value 或 key 变化时，同步写入 localStorage
  // 依赖数组 [key, value] 表示：这两个变量变化时重新执行
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 存储满或隐私模式可能抛出，静默忽略
      console.warn(`[useStorage] 无法写入 localStorage: ${key}`);
    }
  }, [key, value]);

  return [value, setValue];
}
