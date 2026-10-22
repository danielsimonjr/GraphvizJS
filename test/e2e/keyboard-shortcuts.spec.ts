import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  activeEditorContent,
  activeEditorScroller,
  getEditorContent,
  launchApp,
  selectors,
  waitForAppReady,
} from './helpers';

const FIXTURE_CONTENT = 'digraph Fixture { A -> B }';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  // Ctrl+O / Ctrl+S trigger open/save; stub the native dialogs so they don't hang.
  const dir = mkdtempSync(path.join(tmpdir(), 'gvjs-kbd-'));
  const openPath = path.join(dir, 'fixture.dot');
  const savePath = path.join(dir, 'saved.dot');
  writeFileSync(openPath, FIXTURE_CONTENT, 'utf-8');

  ({ app, page } = await launchApp({ GVJS_E2E_OPEN: openPath, GVJS_E2E_SAVE: savePath }));
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('Keyboard Shortcuts', () => {
  test('Ctrl+N creates new diagram', async () => {
    // Press Ctrl+N — opens a new tab (a second editor instance in the DOM)
    await page.keyboard.press('Control+n');
    await page.waitForTimeout(300);

    await expect(page.locator('.cm-editor')).toHaveCount(2);
  });

  test('Ctrl+O triggers open action', async () => {
    // Press Ctrl+O — with the open stub this loads the fixture file
    await page.keyboard.press('Control+o');
    await page.waitForTimeout(300);

    const content = await getEditorContent(page);
    expect(content).toContain('Fixture');
  });

  test('Ctrl+S triggers save action', async () => {
    // Press Ctrl+S — with the save stub this assigns the save path
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);

    const fileStatus = page.locator('[data-status="file"]');
    await expect(fileStatus).toContainText('saved.dot');
  });

  test('F1 opens help dialog', async () => {
    await page.keyboard.press('F1');
    await page.waitForTimeout(300);

    const helpDialog = page.locator(selectors.helpDialog);
    await expect(helpDialog).toBeVisible();
  });

  test('Escape closes help dialog', async () => {
    await page.keyboard.press('F1');
    await page.waitForTimeout(300);

    const helpDialog = page.locator(selectors.helpDialog);
    await expect(helpDialog).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await expect(helpDialog).not.toBeVisible();
  });

  test('Ctrl+? opens help dialog', async () => {
    // Press Ctrl+?. The key is '?', because 'Control+Shift+/' sends the key '/' and the app
    // binds the key '?'.
    await page.keyboard.press('Control+?');

    await expect(page.locator(selectors.helpDialog)).toBeVisible();
  });

  test('a bare ? typed in the editor does not open the help dialog', async () => {
    const before = await getEditorContent(page);
    await activeEditorContent(page).click();
    await page.keyboard.type('?');

    // The key reached the editor, and the help dialog stayed closed.
    await expect.poll(() => getEditorContent(page)).not.toBe(before);
    await expect(page.locator(selectors.helpDialog)).not.toBeVisible();
  });
});

test.describe('Editor Zoom Shortcuts', () => {
  test('Ctrl+= zooms in editor', async () => {
    const editor = page.locator(selectors.editor);
    await editor.click();
    await page.keyboard.press('Control+=');

    // One zoom step is 10% of the 16px base font, which rounds to 18px.
    await expect(activeEditorScroller(page)).toHaveCSS('font-size', '18px');
  });

  test('Ctrl+- zooms out editor', async () => {
    const editor = page.locator(selectors.editor);
    await editor.click();
    await page.keyboard.press('Control+-');

    // One step down is 90% of 16px, which rounds to 14px.
    await expect(activeEditorScroller(page)).toHaveCSS('font-size', '14px');
  });

  test('Ctrl+0 resets editor zoom', async () => {
    const editor = page.locator(selectors.editor);
    await editor.click();
    await page.keyboard.press('Control+=');
    await expect(activeEditorScroller(page)).toHaveCSS('font-size', '18px');

    await page.keyboard.press('Control+0');
    await expect(activeEditorScroller(page)).toHaveCSS('font-size', '16px');
  });
});

test.describe('Menu Keyboard Navigation', () => {
  test('Tab moves focus from the New button to Open and then to Save', async () => {
    await page.locator(selectors.newBtn).focus();
    await expect(page.locator(selectors.newBtn)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator(selectors.openBtn)).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.locator(selectors.saveBtn)).toBeFocused();
  });
});
