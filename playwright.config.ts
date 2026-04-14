import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置
 *
 * 测试分层（用 @tag 标记）：
 *   @smoke  — 纯 UI，不需要 API Key，任何环境都可以跑
 *   @api    — 需要有效的 Gemini API Key（从 .env.local 读取）
 *   @mcp    — 需要 MCP 服务器运行在 port 3001
 *
 * 运行方式：
 *   npx playwright test                      # 全部
 *   npx playwright test --grep @smoke        # 仅基础 UI
 *   npx playwright test --grep @api          # 仅 AI 功能
 *   npx playwright test --ui                 # 可视化调试模式（推荐）
 *   npx playwright show-report               # 查看上次测试报告
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    // 允许剪贴板写入（handleCopy 使用 navigator.clipboard.writeText）
    permissions: ['clipboard-read', 'clipboard-write'],
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
