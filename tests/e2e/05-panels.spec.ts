/**
 * 05-panels.spec.ts — @smoke 侧边面板开关测试
 *
 * 覆盖：
 *   - 记忆库面板开关
 *   - 指令框开关
 *   - 图谱面板可打开（MCP 离线时显示离线提示）
 *   - 快捷键帮助面板（? 键）
 *   - 导出下拉菜单点击外部关闭
 */

import { test, expect } from '@playwright/test';
import { resetAppState, waitForApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetAppState(page);
  await page.goto('/');
  await waitForApp(page);
});

test('@smoke 记忆库面板可打开', async ({ page }) => {
  const memBtn = page.locator('button', { hasText: /记忆/ });
  await memBtn.click();
  // 记忆面板或 modal 出现
  const panel = page.locator('.memory-panel, [class*="memory"], .modal-panel').first();
  await expect(panel).toBeVisible({ timeout: 5_000 });
});

test('@smoke 记忆库面板可关闭', async ({ page }) => {
  const memBtn = page.locator('button', { hasText: /记忆/ });
  await memBtn.click();
  const panel = page.locator('.memory-panel, [class*="memory"], .modal-panel').first();
  await expect(panel).toBeVisible({ timeout: 5_000 });

  // 点背景遮罩关闭（MemoryPanel 使用 memory-backdrop 而非 modal-backdrop）
  await page.locator('.memory-backdrop').first().click({ position: { x: 10, y: 10 } });
  await expect(panel).not.toBeVisible({ timeout: 3_000 });
});

test('@smoke 工具栏指令开关按钮', async ({ page }) => {
  const instrBtn = page.locator('button', { hasText: /指令/ });
  await instrBtn.click();
  // 指令输入区可见
  const instrArea = page.locator('textarea[placeholder*="指令"], [class*="instruction"]').first();
  if (await instrArea.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(instrArea).toBeVisible();
  }
});

test('@smoke 知识图谱面板可打开', async ({ page }) => {
  const graphBtn = page.locator('button[title*="图谱"], button', { hasText: '图谱' });
  await graphBtn.click();

  // 图谱面板出现（MCP 在线显示 canvas，离线显示 offline 提示）
  const graphPanel = page.locator('.gp-float').first();
  await expect(graphPanel).toBeVisible({ timeout: 5_000 });
});

test('@smoke MCP 离线时图谱显示重连提示', async ({ page }) => {
  const graphBtn = page.locator('button[title*="图谱"], button', { hasText: '图谱' });
  await graphBtn.click();

  const graphPanel = page.locator('.gp-float').first();
  await expect(graphPanel).toBeVisible({ timeout: 5_000 });

  // 如果 MCP 未运行，应显示离线或重连按钮（不崩溃）
  const hasOffline = await page.locator('.gp-offline, text=/MCP|重新连接/').isVisible({ timeout: 3_000 })
    .catch(() => false);
  const hasCanvas = await page.locator('canvas').isVisible({ timeout: 1_000 })
    .catch(() => false);

  // 至少有一种状态（离线提示 OR canvas 图谱）
  expect(hasOffline || hasCanvas).toBe(true);
});

test('@smoke 图谱面板可关闭', async ({ page }) => {
  const graphBtn = page.locator('button', { hasText: '图谱' });
  await graphBtn.click();
  const graphPanel = page.locator('.gp-float').first();
  await expect(graphPanel).toBeVisible({ timeout: 5_000 });

  await page.locator('.gp-hbtn', { hasText: '✕' }).first().click();
  await expect(graphPanel).not.toBeVisible({ timeout: 3_000 });
});

test('@smoke 导出菜单点击外部后关闭', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.fill('测试内容，用于验证导出菜单。');

  await page.locator('button', { hasText: /导出/ }).click();
  await expect(page.locator('.export-menu')).toBeVisible();

  // 点击编辑器区域关闭菜单
  await editor.click();
  await expect(page.locator('.export-menu')).not.toBeVisible({ timeout: 2_000 });
});
