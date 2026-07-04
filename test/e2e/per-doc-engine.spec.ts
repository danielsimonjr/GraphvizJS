import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { launchApp, waitForAppReady } from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test('layout engine is per-tab and the selector follows the active tab', async () => {
  const select = page.locator('#layout-engine');

  // Tab 1: set neato.
  await select.selectOption('neato');

  // Open a second tab (defaults to dot).
  await page.locator('.tab-new').click();
  await expect(select).toHaveValue('dot');

  // Switch back to tab 1 -> selector restores neato.
  await page.locator('[role="tab"]').first().click();
  await expect(select).toHaveValue('neato');
});
