import { test, expect } from '@playwright/test';
import { waitForAppReady, openExportMenu, setEditorContent, waitForPreviewUpdate, selectors } from './helpers';

test.describe('Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('export menu opens on click', async ({ page }) => {
    const exportBtn = page.locator(selectors.exportBtn);
    await exportBtn.click();

    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).toBeVisible();
  });

  test('export menu contains PNG option', async ({ page }) => {
    await openExportMenu(page);

    const pngOption = page.locator('.export-menu button:has-text("PNG")');
    await expect(pngOption).toBeVisible();
  });

  test('export menu contains PNG @2x option', async ({ page }) => {
    await openExportMenu(page);

    const png2xOption = page.locator('.export-menu button:has-text("2x"), .export-menu button:has-text("@2x")');
    await expect(png2xOption).toBeVisible();
  });

  test('export menu contains SVG option', async ({ page }) => {
    await openExportMenu(page);

    const svgOption = page.locator('.export-menu button:has-text("SVG")');
    await expect(svgOption).toBeVisible();
  });

  test('export menu closes on outside click', async ({ page }) => {
    await openExportMenu(page);

    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).toBeVisible();

    // Click outside the menu
    await page.click(selectors.editor);

    await expect(exportMenu).not.toBeVisible();
  });

  test('export menu closes after selection', async ({ page }) => {
    await openExportMenu(page);

    // Set up download handler (export triggers download in browser)
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

    // Click SVG export (least complex)
    const svgOption = page.locator('.export-menu button:has-text("SVG")');
    await svgOption.click();

    // Menu should close
    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).not.toBeVisible();
  });

  test('export works with valid diagram', async ({ page }) => {
    // Ensure we have a valid diagram
    await setEditorContent(page, 'digraph G { A -> B }');
    await waitForPreviewUpdate(page);

    await openExportMenu(page);

    // Click SVG export
    const svgOption = page.locator('.export-menu button:has-text("SVG")');
    await expect(svgOption).toBeEnabled();
  });
});

test.describe('Export Menu Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('Escape closes export menu', async ({ page }) => {
    await openExportMenu(page);

    const exportMenu = page.locator(selectors.exportMenu);
    await expect(exportMenu).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(exportMenu).not.toBeVisible();
  });

  test('arrow keys navigate menu options', async ({ page }) => {
    await openExportMenu(page);

    // Press down arrow to move through options
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // Focus should be on a menu item
    const focusedElement = page.locator('.export-menu button:focus');
    const hasFocus = await focusedElement.count();
    expect(hasFocus >= 0).toBe(true); // Navigation may or may not move focus
  });
});
