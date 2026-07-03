import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  activeEditorContent,
  getEditorContent,
  launchApp,
  selectors,
  waitForAppReady,
} from './helpers';

let app: ElectronApplication;
let page: Page;
let openPath: string;

// Un-indented multi-line DOT, loaded via the app's file-open stub (GVJS_E2E_OPEN)
// so it bypasses per-char typing — CodeMirror closeBrackets corrupts multi-line
// braces typed via page.keyboard.type().
const MESSY_DOT = 'digraph G {\nsubgraph cluster_0 {\na -> b;\n}\n}\n';

test.beforeEach(async () => {
  openPath = path.join(mkdtempSync(path.join(tmpdir(), 'gvjs-ea-')), 'messy.dot');
  writeFileSync(openPath, MESSY_DOT, 'utf-8');
  ({ app, page } = await launchApp({ GVJS_E2E_OPEN: openPath }));
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

  test('Format button reindents a messy multi-line diagram', async () => {
    // Load the un-indented multi-line diagram via the app's file-open stub.
    await page.locator(selectors.openBtn).click();
    // Wait for the opened content to land in the active editor.
    await expect(activeEditorContent(page)).toContainText('subgraph cluster_0');
    await page.locator('[data-action="format"]').click();
    const text = await getEditorContent(page);
    // Reindented: subgraph at depth 1 (2 spaces), the edge at depth 2 (4 spaces).
    expect(text).toContain('  subgraph cluster_0');
    expect(text).toContain('    a -> b;');
  });
});
