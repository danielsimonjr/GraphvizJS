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

test('closing the active tab syncs the selector to the newly-active tab', async () => {
  const select = page.locator('#layout-engine');

  // Tab 1: set neato.
  await select.selectOption('neato');

  // Open a second tab (defaults to dot) -- it becomes the active tab.
  await page.locator('.tab-new').click();
  await expect(select).toHaveValue('dot');

  // Close the currently-active (second) tab via its close control.
  await page.locator('[role="tab"][aria-selected="true"] [data-tab-close]').click();

  // Tab 1 (neato) becomes active again -- selector must follow it.
  await expect(select).toHaveValue('neato');
});
