import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  getEditorContent,
  launchApp,
  selectors,
  setEditorContent,
  waitForAppReady,
  waitForPreviewUpdate,
} from './helpers';

const FIXTURE_CONTENT = 'digraph Fixture { A -> B -> C }';

let app: ElectronApplication;
let page: Page;
let openPath: string;
let savePath: string;

test.beforeEach(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gvjs-fileops-'));
  openPath = path.join(dir, 'fixture.dot');
  savePath = path.join(dir, 'saved.dot');
  writeFileSync(openPath, FIXTURE_CONTENT, 'utf-8');

  // Stub the native open/save dialogs so the renderer receives deterministic paths.
  ({ app, page } = await launchApp({ GVJS_E2E_OPEN: openPath, GVJS_E2E_SAVE: savePath }));
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('File Operations', () => {
  test('new diagram resets editor', async () => {
    // First modify the content
    await setEditorContent(page, 'digraph Modified { X -> Y }');
    await waitForPreviewUpdate(page);

    // Click new button (opens a fresh tab with the default snippet)
    await page.locator(selectors.newBtn).click();
    await waitForPreviewUpdate(page);

    // Visible editor should show default content, not the modified text
    const content = await getEditorContent(page);
    expect(content).not.toContain('Modified');
  });

  test('save button exists and is clickable', async () => {
    const saveBtn = page.locator(selectors.saveBtn);
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();
  });

  test('open button exists and is clickable', async () => {
    const openBtn = page.locator(selectors.openBtn);
    await expect(openBtn).toBeVisible();
    await expect(openBtn).toBeEnabled();
  });

  test('open loads file content into a tab', async () => {
    await page.locator(selectors.openBtn).click();
    await waitForPreviewUpdate(page);

    // The stubbed open returns the fixture file; its content should be loaded.
    const content = await getEditorContent(page);
    expect(content).toContain('Fixture');
  });

  test('dirty state shows after editing', async () => {
    const initialContent = await getEditorContent(page);

    // Make a change
    await setEditorContent(page, `${initialContent}\n// Modified`);
    await waitForPreviewUpdate(page);

    // The file status reflects unsaved changes via data-dirty.
    const fileStatus = page.locator('[data-status="file"]');
    await expect(fileStatus).toHaveAttribute('data-dirty', 'true');
  });

  test('Ctrl+S triggers save action', async () => {
    // Press Ctrl+S — with the save stub this writes to savePath and marks saved.
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(500);

    const fileStatus = page.locator('[data-status="file"]');
    await expect(fileStatus).toContainText('saved.dot');
    await expect(fileStatus).toHaveAttribute('data-dirty', 'false');
  });

  test('file path shown in status after save', async () => {
    await page.locator(selectors.saveBtn).click();
    await page.waitForTimeout(500);

    const fileStatus = page.locator('[data-status="file"]');
    await expect(fileStatus).toContainText('saved.dot');
  });
});
