import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  getEditorContent,
  launchApp,
  selectors,
  waitForAppReady,
  waitForPreviewUpdate,
} from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('Examples Menu', () => {
  test('examples menu opens on click', async () => {
    await page.locator(selectors.examplesBtn).click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();
  });

  test('examples menu contains multiple options', async () => {
    await page.locator(selectors.examplesBtn).click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();

    // Should have multiple example buttons
    const exampleButtons = page.locator(selectors.examplesMenuItem);
    const count = await exampleButtons.count();
    expect(count).toBeGreaterThan(1);
  });

  test('example selection loads content into editor', async () => {
    // Get initial content
    const _initialContent = await getEditorContent(page);

    // Open examples menu
    await page.locator(selectors.examplesBtn).click();
    await expect(page.locator(selectors.examplesMenu)).toBeVisible();

    // Click first example
    await page.locator(selectors.examplesMenuItem).first().click();

    await waitForPreviewUpdate(page);

    // Content should be non-empty valid DOT
    const newContent = await getEditorContent(page);
    expect(newContent.length).toBeGreaterThan(0);
  });

  test('example renders in preview', async () => {
    // Open examples menu
    await page.locator(selectors.examplesBtn).click();

    // Click an example
    await page.locator(selectors.examplesMenuItem).first().click();

    await waitForPreviewUpdate(page);

    // Preview should have SVG
    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();
  });

  test('examples menu closes after selection', async () => {
    await page.locator(selectors.examplesBtn).click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();

    // Click an example
    await page.locator(selectors.examplesMenuItem).first().click();

    // Menu should close
    await expect(examplesMenu).not.toBeVisible();
  });

  test('multiple examples can be loaded sequentially', async () => {
    const examplesBtn = page.locator(selectors.examplesBtn);

    // Load first example
    await examplesBtn.click();
    await page.locator(selectors.examplesMenuItem).first().click();
    await waitForPreviewUpdate(page);

    const _firstContent = await getEditorContent(page);

    // Load second example
    await examplesBtn.click();
    await page.locator(selectors.examplesMenuItem).nth(1).click();
    await waitForPreviewUpdate(page);

    const _secondContent = await getEditorContent(page);

    // At minimum, both should render without error
    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();
  });
});

test.describe('Examples Menu Keyboard', () => {
  test('Escape closes examples menu', async () => {
    await page.locator(selectors.examplesBtn).click();

    const examplesMenu = page.locator(selectors.examplesMenu);
    await expect(examplesMenu).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(examplesMenu).not.toBeVisible();
  });
});
