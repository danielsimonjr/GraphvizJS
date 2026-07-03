import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { launchApp, selectors, setEditorContent, waitForAppReady } from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});
test.afterEach(async () => {
  await app.close();
});

test.describe('Editor authoring', () => {
  test('Find button opens the search panel', async () => {
    await page.locator('[data-action="find"]').click();
    await expect(page.locator('.cm-search')).toBeVisible();
  });

  test('Ctrl+F opens the search panel', async () => {
    await page.locator(selectors.editor).first().click();
    await page.keyboard.press('ControlOrMeta+f');
    await expect(page.locator('.cm-search')).toBeVisible();
  });

  test('Format button reindents a messy diagram', async () => {
    // Note: content is kept on a single line — CodeMirror's closeBrackets
    // auto-pairs `{`; typing a `}` on a later line (after intervening
    // Enter keystrokes from setEditorContent) does not skip over the
    // auto-inserted bracket and leaves the doc unbalanced. Single-line
    // input keeps the cursor adjacent to the auto-closed `}` throughout,
    // so the manually typed `}` correctly types over it instead of
    // duplicating it. formatDot still normalizes the messy spacing here.
    await setEditorContent(page, 'digraph G{a  ->   b;    a->c;}');
    await page.locator('[data-action="format"]').click();
    const text = await page.locator(selectors.editor).first().innerText();
    expect(text).toContain('a -> b;');
    expect(text).toContain('a -> c;');
    expect(text).not.toContain('  ->');
  });
});
