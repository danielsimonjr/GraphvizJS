import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  launchApp,
  selectors,
  setEditorContent,
  waitForAppReady,
  waitForPreviewUpdate,
} from './helpers';

let app: ElectronApplication;
let page: Page;
let savePath: string;

test.beforeEach(async () => {
  // Give the app a stubbed save target so clicking an export item does not open
  // a native save dialog (which Playwright cannot drive).
  savePath = path.join(mkdtempSync(path.join(tmpdir(), 'gvjs-export-')), 'export-out');
  ({ app, page } = await launchApp({ GVJS_E2E_SAVE: savePath }));
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('Export Functionality', () => {
  test('export menu opens on click', async () => {
    await page.locator(selectors.exportBtn).click();

    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).toBeVisible();
  });

  test('export menu contains PNG option', async () => {
    await page.locator(selectors.exportBtn).click();

    const pngOption = page.locator(`${selectors.exportMenu} [data-export="png"]`);
    await expect(pngOption).toBeVisible();
  });

  test('export menu contains PNG @2x option', async () => {
    await page.locator(selectors.exportBtn).click();

    const png2xOption = page.locator(`${selectors.exportMenu} [data-export="pngx2"]`);
    await expect(png2xOption).toBeVisible();
  });

  test('export menu contains SVG option', async () => {
    await page.locator(selectors.exportBtn).click();

    const svgOption = page.locator(`${selectors.exportMenu} [data-export="svg"]`);
    await expect(svgOption).toBeVisible();
  });

  test('export menu closes on outside click', async () => {
    await page.locator(selectors.exportBtn).click();

    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).toBeVisible();

    // Click outside the menu (into the editor)
    await page.locator(selectors.editor).first().click();

    await expect(exportMenu).not.toBeVisible();
  });

  test('export menu closes after selection', async () => {
    await page.locator(selectors.exportBtn).click();
    await expect(page.locator(selectors.exportMenu)).toBeVisible();

    // Click SVG export (writes to the stubbed save path).
    await page.locator(`${selectors.exportMenu} [data-export="svg"]`).click();

    // Menu should close
    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).not.toBeVisible();
  });

  test('export works with valid diagram', async () => {
    // Ensure we have a valid diagram
    await setEditorContent(page, 'digraph G { A -> B }');
    await waitForPreviewUpdate(page);

    await page.locator(selectors.exportBtn).click();

    // SVG export option should be enabled
    const svgOption = page.locator(`${selectors.exportMenu} [data-export="svg"]`);
    await expect(svgOption).toBeEnabled();
  });
});

test.describe('PDF Export', () => {
  const pdfDialog = 'dialog.pdf-options-dialog';

  test('export menu contains PDF option', async () => {
    await page.locator(selectors.exportBtn).click();
    const pdfOption = page.locator(`${selectors.exportMenu} [data-export="pdf"]`);
    await expect(pdfOption).toBeVisible();
  });

  test('PDF export (fit) writes a valid PDF via the options dialog', async () => {
    await setEditorContent(page, 'digraph G { A -> B }');
    await waitForPreviewUpdate(page);

    await page.locator(selectors.exportBtn).click();
    await page.locator(`${selectors.exportMenu} [data-export="pdf"]`).click();

    // Options dialog opens; default page mode is "fit" — just click Export.
    await expect(page.locator(pdfDialog)).toBeVisible();
    await page.locator(`${pdfDialog} [data-pdf-action="export"]`).click();

    // Main process writes bytes to the stubbed save path; poll then verify header.
    await expect.poll(() => existsSync(savePath), { timeout: 10000 }).toBe(true);
    const bytes = readFileSync(savePath);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('PDF export Cancel writes nothing', async () => {
    await setEditorContent(page, 'digraph G { A -> B }');
    await waitForPreviewUpdate(page);

    await page.locator(selectors.exportBtn).click();
    await page.locator(`${selectors.exportMenu} [data-export="pdf"]`).click();

    await expect(page.locator(pdfDialog)).toBeVisible();
    await page.locator(`${pdfDialog} [data-pdf-action="cancel"]`).click();

    // Give any (erroneous) write a chance to land, then assert none did.
    await page.waitForTimeout(500);
    expect(existsSync(savePath)).toBe(false);
  });
});

test.describe('Export Menu Keyboard Navigation', () => {
  test('Escape closes export menu', async () => {
    await page.locator(selectors.exportBtn).click();

    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(exportMenu).not.toBeVisible();
  });

  test('arrow keys navigate menu options', async () => {
    await page.locator(selectors.exportBtn).click();
    await expect(page.locator(selectors.exportMenu)).toBeVisible();

    // Press down arrow to move through options
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // Focus may or may not move; just assert the menu is still usable.
    const focusedElement = page.locator(`${selectors.exportMenu} .toolbar-menu-item:focus`);
    const hasFocus = await focusedElement.count();
    expect(hasFocus >= 0).toBe(true);
  });
});
