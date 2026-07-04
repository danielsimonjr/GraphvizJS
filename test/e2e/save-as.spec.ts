import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { launchApp, waitForAppReady } from './helpers';

let app: ElectronApplication;
let page: Page;
let savePath: string;

test.beforeEach(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gvjs-saveas-'));
  savePath = path.join(dir, 'out.dot');

  // Stub the native save dialog so the renderer receives a deterministic path.
  ({ app, page } = await launchApp({ GVJS_E2E_SAVE: savePath }));
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('Save As', () => {
  test('Save As prompts for a path even when the tab already has one', async () => {
    await page.locator('[data-action="save-as-diagram"]').click();
    await page.waitForTimeout(500);

    // File status reflects the chosen path's basename.
    const fileStatus = page.locator('[data-status="file"]');
    await expect(fileStatus).toContainText('out.dot');
  });

  test('Ctrl+Shift+S triggers Save As action', async () => {
    await page.keyboard.press('Control+Shift+s');
    await page.waitForTimeout(500);

    const fileStatus = page.locator('[data-status="file"]');
    await expect(fileStatus).toContainText('out.dot');
    await expect(fileStatus).toHaveAttribute('data-dirty', 'false');
  });
});
