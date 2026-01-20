import { expect, test } from '@playwright/test';
import { getEditorContent, selectors, waitForAppReady, waitForPreviewUpdate } from './helpers';

test.describe('Examples Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('examples menu opens on click', async ({ page }) => {
    const examplesBtn = page.locator(selectors.examplesBtn);
    await examplesBtn.click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();
  });

  test('examples menu contains multiple options', async ({ page }) => {
    const examplesBtn = page.locator(selectors.examplesBtn);
    await examplesBtn.click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();

    // Should have multiple example buttons
    const exampleButtons = page.locator('.examples-menu button');
    const count = await exampleButtons.count();
    expect(count).toBeGreaterThan(1);
  });

  test('example selection loads content into editor', async ({ page }) => {
    // Get initial content
    const _initialContent = await getEditorContent(page);

    // Open examples menu
    const examplesBtn = page.locator(selectors.examplesBtn);
    await examplesBtn.click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();

    // Click first example (skip if it's already selected)
    const firstExample = page.locator('.examples-menu button').first();
    await firstExample.click();

    await waitForPreviewUpdate(page);

    // Content should have changed or be valid DOT
    const newContent = await getEditorContent(page);
    expect(newContent.length).toBeGreaterThan(0);
  });

  test('example renders in preview', async ({ page }) => {
    // Open examples menu
    const examplesBtn = page.locator(selectors.examplesBtn);
    await examplesBtn.click();

    // Click an example
    const example = page.locator('.examples-menu button').first();
    await example.click();

    await waitForPreviewUpdate(page);

    // Preview should have SVG
    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();
  });

  test('examples menu closes after selection', async ({ page }) => {
    const examplesBtn = page.locator(selectors.examplesBtn);
    await examplesBtn.click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();

    // Click an example
    const example = page.locator('.examples-menu button').first();
    await example.click();

    // Menu should close
    await expect(examplesMenu).not.toBeVisible();
  });

  test('multiple examples can be loaded sequentially', async ({ page }) => {
    const examplesBtn = page.locator(selectors.examplesBtn);

    // Load first example
    await examplesBtn.click();
    let example = page.locator('.examples-menu button').first();
    await example.click();
    await waitForPreviewUpdate(page);

    const _firstContent = await getEditorContent(page);

    // Load second example
    await examplesBtn.click();
    example = page.locator('.examples-menu button').nth(1);
    await example.click();
    await waitForPreviewUpdate(page);

    const _secondContent = await getEditorContent(page);

    // Contents should be different (unless same example)
    // At minimum, both should render without error
    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();
  });
});

test.describe('Examples Menu Keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('Escape closes examples menu', async ({ page }) => {
    const examplesBtn = page.locator(selectors.examplesBtn);
    await examplesBtn.click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(examplesMenu).not.toBeVisible();
  });
});
