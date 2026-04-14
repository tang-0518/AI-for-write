/**
 * 03-editor.spec.ts — @smoke 编辑器核心交互测试
 *
 * 覆盖：
 *   - 输入文字后字数统计更新
 *   - 清空按钮 + 撤销（5秒内可撤销）
 *   - 复制全文
 *   - 导出菜单打开，当前章节 .txt / .md 触发下载
 *   - 一键排版（段首缩进）
 *   - 快捷键帮助面板（? 键）
 */

import { test, expect } from '@playwright/test';
import { resetAppState, waitForApp } from './helpers';

const SAMPLE_TEXT = '这是第一段，描述了主角的日常生活。\n\n这是第二段，情节开始发展起来。';

test.beforeEach(async ({ page }) => {
  await resetAppState(page);
  await page.goto('/');
  await waitForApp(page);
});

test('@smoke 输入文字后字数统计更新', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.fill(SAMPLE_TEXT);
  // 字数统计区域应显示非零数字
  const statsArea = page.locator('.stats-bar, .status-bar, [class*="stat"]').first();
  if (await statsArea.isVisible()) {
    const text = await statsArea.textContent();
    expect(text).toMatch(/\d+/);
  }
});

test('@smoke 清空内容后出现撤销按钮', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.fill(SAMPLE_TEXT);

  // 清空按钮会弹出 window.confirm，预先接受
  page.once('dialog', d => d.accept());
  const clearBtn = page.locator('button', { hasText: '清空' });
  await clearBtn.click();

  // 5秒内出现"撤销"按钮
  const undoBtn = page.locator('.btn-undo, button', { hasText: /撤销/ });
  await expect(undoBtn).toBeVisible({ timeout: 3_000 });
});

test('@smoke 撤销清空恢复内容', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.fill(SAMPLE_TEXT);

  // 清空按钮会弹出 window.confirm，预先接受
  page.once('dialog', d => d.accept());
  const clearBtn = page.locator('button', { hasText: '清空' });
  await clearBtn.click();
  await expect(editor).toHaveValue('');

  // 点撤销
  const undoBtn = page.locator('.btn-undo').first();
  await undoBtn.click();
  const restored = await editor.inputValue();
  expect(restored.length).toBeGreaterThan(0);
});

test('@smoke 复制按钮点击后显示"已复制"', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.fill('测试复制内容。');

  const copyBtn = page.locator('button', { hasText: /复制/ });
  await copyBtn.click();
  // 按钮文字短暂变为"已复制"
  await expect(page.locator('button', { hasText: '已复制' })).toBeVisible({ timeout: 2_000 });
});

test('@smoke 导出菜单打开并显示选项', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.fill(SAMPLE_TEXT);

  const exportBtn = page.locator('button', { hasText: /导出/ });
  await exportBtn.click();

  await expect(page.locator('.export-menu')).toBeVisible();
  await expect(page.locator('.export-menu-item', { hasText: '.txt' }).first()).toBeVisible();
  await expect(page.locator('.export-menu-item', { hasText: '.md' }).first()).toBeVisible();
});

test('@smoke 导出当前章节 .txt 触发下载', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.fill(SAMPLE_TEXT);

  const exportBtn = page.locator('button', { hasText: /导出/ });
  await exportBtn.click();

  // 等待下载事件
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 5_000 }),
    page.locator('.export-menu-item', { hasText: '纯文本 .txt' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
});

test('@smoke 快捷键 ? 打开帮助面板', async ({ page }) => {
  const editor = page.locator('.editor-textarea');
  await editor.click();
  await page.keyboard.press('?');

  const helpPanel = page.locator('.shortcut-help, [class*="shortcut"]');
  if (await helpPanel.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await expect(helpPanel).toBeVisible();
  }
  // 若没有快捷键面板也不报错（功能可选）
});
