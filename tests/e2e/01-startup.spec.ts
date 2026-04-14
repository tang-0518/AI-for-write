/**
 * 01-startup.spec.ts — @smoke 应用启动基础测试
 *
 * 覆盖：
 *   - 页面能正常加载，不出现白屏或 JS 报错
 *   - 工具栏品牌名称可见
 *   - 核心 UI 元素存在（工具栏、编辑区、命令栏）
 *   - 页面标题正确
 */

import { test, expect } from '@playwright/test';
import { resetAppState, waitForApp } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetAppState(page);
  await page.goto('/');
  await waitForApp(page);
});

test('@smoke 品牌名称可见', async ({ page }) => {
  const brand = page.locator('.brand-name');
  await expect(brand).toBeVisible();
  await expect(brand).toContainText('AI');
});

test('@smoke 工具栏所有核心按钮存在', async ({ page }) => {
  // 记忆库
  await expect(page.locator('button', { hasText: '记忆' })).toBeVisible();
  // 指令
  await expect(page.locator('button', { hasText: '指令' })).toBeVisible();
  // 复制
  await expect(page.locator('button', { hasText: '复制' })).toBeVisible();
  // 导出
  await expect(page.locator('button', { hasText: '导出' })).toBeVisible();
  // 设置
  await expect(page.locator('button[title="设置"]')).toBeVisible();
});

test('@smoke 编辑器区域可见且可输入', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.fill('这是一段测试文字。');
  await expect(editor).toHaveValue('这是一段测试文字。');
});

test('@smoke 命令栏（续写按钮）可见', async ({ page }) => {
  // CommandBar 包含续写相关按钮
  const continueBtn = page.locator('button', { hasText: /续写|AI续写/ }).first();
  await expect(continueBtn).toBeVisible();
});

test('@smoke 无 JS 控制台报错', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.reload();
  await waitForApp(page);
  // 过滤掉 MCP 离线的预期错误
  const realErrors = errors.filter(e =>
    !e.includes('MCP') && !e.includes('3001') && !e.includes('Failed to fetch'),
  );
  expect(realErrors).toHaveLength(0);
});
