import { expect, test } from '@playwright/test';
import { selectors, waitForAppReady } from './helpers';

test.describe('App Launch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('app launches successfully', async ({ page }) => {
    // Page should load without errors
    await expect(page).toHaveURL('http://localhost:5173/');
  });

  test('editor pane is visible', async ({ page }) => {
    const editor = page.locator(selectors.editor);
    await expect(editor).toBeVisible();
  });

  test('preview pane is visible', async ({ page }) => {
    const preview = page.locator(selectors.preview);
    await expect(preview).toBeVisible();
  });

  test('toolbar is present', async ({ page }) => {
    const toolbar = page.locator(selectors.toolbar);
    await expect(toolbar).toBeVisible();
  });

  test('default snippet renders on load', async ({ page }) => {
    // Should have SVG in preview from default content
    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();
  });

  test('window title contains GraphvizJS', async ({ page }) => {
    await expect(page).toHaveTitle(/GraphvizJS/i);
  });
});

test.describe('Toolbar Buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('new button is present', async ({ page }) => {
    const btn = page.locator(selectors.newBtn);
    await expect(btn).toBeVisible();
  });

  test('open button is present', async ({ page }) => {
    const btn = page.locator(selectors.openBtn);
    await expect(btn).toBeVisible();
  });

  test('save button is present', async ({ page }) => {
    const btn = page.locator(selectors.saveBtn);
    await expect(btn).toBeVisible();
  });

  test('export button is present', async ({ page }) => {
    const btn = page.locator(selectors.exportBtn);
    await expect(btn).toBeVisible();
  });

  test('examples button is present', async ({ page }) => {
    const btn = page.locator(selectors.examplesBtn);
    await expect(btn).toBeVisible();
  });

  test('help button is present', async ({ page }) => {
    const btn = page.locator(selectors.helpBtn);
    await expect(btn).toBeVisible();
  });
});
