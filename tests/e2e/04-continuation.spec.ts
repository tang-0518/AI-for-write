/**
 * 04-continuation.spec.ts — @api 续写全流程测试
 *
 * 覆盖：
 *   - 续写按钮在有内容时可点击
 *   - 续写触发后出现加载状态（isStreaming）
 *   - 流式文字出现在 AiSuggestionPanel
 *   - 流结束后出现"接受"和"拒绝"按钮
 *   - 接受：AI 文字追加到编辑器正文
 *   - 拒绝：正文不变，Panel 消失
 *   - 无 API Key 时续写报错提示正确
 */

import { test, expect } from '@playwright/test';
import { resetAppState, waitForApp, seedSettings, hasApiKey } from './helpers';

// 正式续写用的种子文字（足够 50 字触发续写条件）
const SEED_TEXT = '林晚站在窗边，望着远处连绵的山脉，心中涌起一股说不清的情绪。' +
  '已经三年了，自从那次意外之后，他再也没有回过这个小镇。' +
  '今天，他终于鼓起勇气，推开了记忆中那扇沉重的木门。';

test.beforeEach(async ({ page }) => {
  await resetAppState(page);
});

test('@smoke 编辑器内容不足 50 字时点续写出现提示', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);

  const editor = page.locator('.editor-textarea');
  await editor.fill('太短了。');

  const continueBtn = page.locator('button', { hasText: /AI续写|续写/ }).first();
  await continueBtn.click();

  await expect(page.locator('text=/至少.*字|内容太短/')).toBeVisible({ timeout: 3_000 });
});

test('@smoke 无 API Key 时续写提示填写 Key', async ({ page }) => {
  // 显式覆盖 API Key 为空，防止 .env.local 中的 VITE_GEMINI_API_KEY
  // 被编译进 DEFAULT_SETTINGS 并在 localStorage 清空后作为默认值使用
  await seedSettings(page, { apiKey: '' });
  await page.goto('/');
  await waitForApp(page);

  const editor = page.locator('.editor-textarea');
  await editor.fill(SEED_TEXT);

  const continueBtn = page.locator('button', { hasText: /AI续写|续写/ }).first();
  await continueBtn.click();

  await expect(page.locator('text=/API Key|api key/i')).toBeVisible({ timeout: 3_000 });
});

test('@api 续写流式输出，接受后追加到正文', async ({ page }) => {
  test.skip(!hasApiKey(), '需要有效的 VITE_GEMINI_API_KEY');
  test.setTimeout(60_000);

  await seedSettings(page);
  await page.goto('/');
  await waitForApp(page);

  const editor = page.locator('.editor-textarea');
  await editor.fill(SEED_TEXT);
  const originalLen = SEED_TEXT.length;

  // 点续写
  const continueBtn = page.locator('button', { hasText: /AI续写|续写/ }).first();
  await continueBtn.click();

  // 等待流式面板出现（isStreaming = true 时显示）
  const suggestionPanel = page.locator('.ai-suggestion, [class*="suggestion"], [class*="pending"]');
  await expect(suggestionPanel.first()).toBeVisible({ timeout: 15_000 });

  // 等待"接受"按钮出现（流结束后 hasPendingContinuation = true）
  const acceptBtn = page.locator('button', { hasText: /接受|✓/ });
  await expect(acceptBtn).toBeVisible({ timeout: 45_000 });

  // 点接受
  await acceptBtn.click();

  // 验证正文变长了
  const newValue = await editor.inputValue();
  expect(newValue.length).toBeGreaterThan(originalLen + 10);
});

test('@api 续写后点拒绝，正文不变', async ({ page }) => {
  test.skip(!hasApiKey(), '需要有效的 VITE_GEMINI_API_KEY');
  test.setTimeout(60_000);

  await seedSettings(page);
  await page.goto('/');
  await waitForApp(page);

  const editor = page.locator('.editor-textarea');
  await editor.fill(SEED_TEXT);

  const continueBtn = page.locator('button', { hasText: /AI续写|续写/ }).first();
  await continueBtn.click();

  const rejectBtn = page.locator('button', { hasText: /拒绝|✗|×/ });
  await expect(rejectBtn).toBeVisible({ timeout: 45_000 });
  await rejectBtn.click();

  // 正文应等于原始内容
  const finalValue = await editor.inputValue();
  expect(finalValue.trim()).toBe(SEED_TEXT.trim());
});
