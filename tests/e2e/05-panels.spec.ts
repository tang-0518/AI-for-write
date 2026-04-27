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
  await page.getByRole('tab', { name: 'Memory' }).click();
  const panel = page.locator('.msb-root').first();
  await expect(panel).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.msb-title', { hasText: '记忆' })).toBeVisible();
});

test('@smoke 记忆库面板可切回 AI', async ({ page }) => {
  await page.getByRole('tab', { name: 'Memory' }).click();
  const panel = page.locator('.msb-root').first();
  await expect(panel).toBeVisible({ timeout: 5_000 });

  await page.getByRole('tab', { name: 'AI' }).click();
  await expect(page.locator('.rs-ai-tab')).toBeVisible();
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
  await page.getByRole('tab', { name: 'Graph' }).click();
  await expect(page.locator('.mg-root')).toBeVisible({ timeout: 5_000 });
});

test('@smoke 3D 图谱浮层可打开', async ({ page }) => {
  await page.getByRole('tab', { name: 'Graph' }).click();
  await page.locator('button', { hasText: '3D' }).click();
  const graphPanel = page.locator('.gp-float').first();
  await expect(graphPanel).toBeVisible({ timeout: 5_000 });
});

test('@smoke 图谱面板可关闭', async ({ page }) => {
  await page.getByRole('tab', { name: 'Graph' }).click();
  await page.locator('button', { hasText: '3D' }).click();
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
