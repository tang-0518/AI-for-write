/**
 * tests/e2e/helpers.ts — 测试辅助函数
 *
 * 提供：
 *   - resetAppState()   清空 localStorage + IndexedDB，回到首次打开状态
 *   - seedApiKey()      注入 API Key（避免每个测试都手动填写）
 *   - waitForApp()      等待 React 应用完成挂载
 *   - openSettings()    打开设置面板
 *   - closeModal()      关闭当前弹窗
 */

import type { Page } from '@playwright/test';

/** API Key（从环境变量读取，CI 中可通过 secrets 注入）*/
export const TEST_API_KEY = process.env.VITE_GEMINI_API_KEY ?? '';
export const TEST_MODEL   = process.env.VITE_GEMINI_MODEL   ?? 'gemini-2.5-flash';

/** 是否有有效 API Key（用于跳过 @api 测试）*/
export const hasApiKey = () => TEST_API_KEY.startsWith('AIza') && TEST_API_KEY.length > 20;

/**
 * 清空所有本地状态（localStorage + IndexedDB），
 * 确保每个测试从干净的初始状态开始。
 */
export async function resetAppState(page: Page) {
  await page.addInitScript(() => {
    // localStorage
    localStorage.clear();

    // IndexedDB：删除所有 novel-ai-* 数据库
    const deleteDB = (name: string) =>
      new Promise<void>(resolve => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror   = () => resolve();
        req.onblocked = () => resolve();
      });

    // 异步但不 await（页面加载前执行即可）
    deleteDB('novel-ai-db');
    deleteDB('novel-ai-kv');
  });
}

/**
 * 通过 localStorage 直接注入设置（跳过 UI 填写步骤），
 * 用于 @api 测试的前置条件。
 */
export async function seedSettings(page: Page, overrides: Record<string, unknown> = {}) {
  await page.addInitScript(({ key, model, extra }) => {
    const settings = {
      schemaVersion: 5,
      apiKey: key,
      model,
      style: 'romance',
      autoSave: true,
      writeLength: 'medium',
      customPrompt: '',
      promptPresets: [],
      creativity: 'balanced',
      wordGoal: 0,
      usePrevChapterContext: true,
      compactTriggerRatio: 0.85,
      memoryTokenBudget: 1500,
      editorFontSize: 17,
      editorFont: "'Noto Serif SC', serif",
      imitationMode: false,
      imitationProfileId: '',
      modularWriting: false,
      ...extra,
    };
    localStorage.setItem('novel-ai-settings', JSON.stringify(settings));
  }, { key: TEST_API_KEY, model: TEST_MODEL, extra: overrides });
}

/** 等待应用 React 树挂载完成，并处理首次启动的"新建书目"弹窗 */
export async function waitForApp(page: Page) {
  await page.waitForSelector('.toolbar', { timeout: 10_000 });

  // 首次启动（resetAppState 清空数据后）会自动弹出"新建书目"对话框。
  // isFirst=true 时无取消按钮，必须创建一个测试书目才能关闭它。
  const createModal = page.locator('.create-book-modal');
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await createModal.isVisible().catch(() => false)) {
      await createModal.locator('input[placeholder="请输入书名…"]').fill(`测试书目 ${Date.now()}`);
      await createModal.locator('button.btn-primary', { hasText: '创建书目' }).click();
      await createModal.waitFor({ state: 'hidden', timeout: 8_000 });
      return;
    }
    await page.waitForTimeout(250);
  }
}

/** 打开设置面板 */
export async function openSettings(page: Page) {
  await page.click('button[title="设置"]');
  await page.waitForSelector('.settings-panel', { timeout: 5_000 });
}

/** 关闭当前弹窗（点击 ✕ 按钮）*/
export async function closeModal(page: Page) {
  const closeBtn = page.locator('.modal-close').first();
  await closeBtn.click();
}
