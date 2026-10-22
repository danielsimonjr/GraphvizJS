import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { activeEditorContent, launchApp, waitForAppReady } from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

/**
 * The scroller of the active tab's editor. The app hides the editors of the
 * other tabs with an inline `display:none`, so that style marks the inactive ones.
 */
function activeScroller(target: Page) {
  return target.locator('.cm-editor:not([style*="none"]) .cm-scroller').first();
}

test('a tab opened after a zoom starts at the current editor zoom', async () => {
  await activeEditorContent(page).click();
  await page.keyboard.press('ControlOrMeta+=');
  await page.keyboard.press('ControlOrMeta+=');
  await expect(activeScroller(page)).toHaveCSS('font-size', '19px');

  await page.locator('.tab-new').click();

  await expect(activeScroller(page)).toHaveCSS('font-size', '19px');
});

test('an editor zoom change in one tab applies to every tab', async () => {
  await page.locator('.tab-new').click();
  await activeEditorContent(page).click();
  await page.keyboard.press('ControlOrMeta+=');
  await expect(activeScroller(page)).toHaveCSS('font-size', '18px');

  // The first tab follows the zoom that was made in the second tab.
  await page.locator('[role="tab"]').first().click();
  await expect(activeScroller(page)).toHaveCSS('font-size', '18px');

  // A reset in the first tab resets the second tab.
  await activeEditorContent(page).click();
  await page.keyboard.press('ControlOrMeta+0');
  await expect(activeScroller(page)).toHaveCSS('font-size', '16px');
  await page.locator('[role="tab"]').nth(1).click();
  await expect(activeScroller(page)).toHaveCSS('font-size', '16px');
});
