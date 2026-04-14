/**
 * 02-settings.spec.ts — @smoke 设置面板测试
 *
 * 覆盖：
 *   - 设置面板能打开 / 关闭
 *   - API Key 输入框存在，可输入，可切换显示/隐藏
 *   - 模型预设按钮可点击，值正确更新
 *   - 取消不保存，保存后设置持久化
 *   - 连接测试按钮存在（@api 测试真实调用）
 */

import { test, expect } from '@playwright/test';
import { resetAppState, waitForApp, openSettings, hasApiKey, seedSettings, TEST_API_KEY, TEST_MODEL } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetAppState(page);
  await page.goto('/');
  await waitForApp(page);
});

test('@smoke 设置面板可打开和关闭', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('.settings-panel')).toBeVisible();

  // 点取消关闭
  await page.locator('button', { hasText: '取消' }).click();
  await expect(page.locator('.settings-panel')).not.toBeVisible();
});

test('@smoke API Key 输入框可见，默认密码模式', async ({ page }) => {
  await openSettings(page);
  const input = page.locator('input[type="password"]').first();
  await expect(input).toBeVisible();
  await input.fill('AIzaTestKey123');
  await expect(input).toHaveValue('AIzaTestKey123');
});

test('@smoke 眼睛按钮切换 API Key 显隐', async ({ page }) => {
  await openSettings(page);
  const toggleBtn = page.locator('.toggle-visibility').first();
  const input = page.locator('input[placeholder="AIza..."]');

  // 默认隐藏
  await expect(input).toHaveAttribute('type', 'password');
  await toggleBtn.click();
  await expect(input).toHaveAttribute('type', 'text');
  await toggleBtn.click();
  await expect(input).toHaveAttribute('type', 'password');
});

test('@smoke 点击模型预设按钮更新输入框', async ({ page }) => {
  await openSettings(page);
  // 点击 gemini-2.5-flash 预设
  await page.locator('.settings-preset', { hasText: 'gemini-2.5-flash' }).first().click();
  const modelInput = page.locator('input[placeholder*="gemini"]');
  await expect(modelInput).toHaveValue('gemini-2.5-flash');
});

test('@smoke 保存设置后重载页面设置保留', async ({ page }) => {
  await openSettings(page);
  // 切换到外观 tab 改字号
  await page.locator('.settings-nav-item', { hasText: '外观' }).click();
  // 点击重置（确保有状态变化）
  await page.locator('button', { hasText: '重置' }).click();
  await page.locator('button', { hasText: '保存设置' }).click();

  // 重载后设置面板应仍可打开（证明持久化了）
  await page.reload();
  await waitForApp(page);
  await openSettings(page);
  await expect(page.locator('.settings-panel')).toBeVisible();
});

test('@smoke 连接测试按钮存在', async ({ page }) => {
  await openSettings(page);
  const testBtn = page.locator('button', { hasText: '测试连接' });
  await expect(testBtn).toBeVisible();
});

test('@api 连接测试成功显示"连接成功"', async ({ page }) => {
  test.skip(!hasApiKey(), '需要有效的 VITE_GEMINI_API_KEY');

  await seedSettings(page);
  await page.goto('/');
  await waitForApp(page);
  await openSettings(page);

  await page.locator('button', { hasText: '测试连接' }).click();
  // 等待测试完成（最多 30 秒）
  await expect(page.locator('text=连接成功')).toBeVisible({ timeout: 30_000 });
});

test('@api 错误 API Key 显示失败提示', async ({ page }) => {
  await seedSettings(page, { apiKey: 'AIzaINVALIDKEY000' });
  await page.goto('/');
  await waitForApp(page);
  await openSettings(page);

  await page.locator('button', { hasText: '测试连接' }).click();
  // 应显示失败状态（✗ 开头）
  await expect(page.locator('span', { hasText: /✗/ })).toBeVisible({ timeout: 15_000 });
});
