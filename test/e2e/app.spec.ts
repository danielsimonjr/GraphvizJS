import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { launchApp, selectors, waitForAppReady } from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('App Launch', () => {
  test('app launches successfully', async () => {
    // App booted: a window exists and the toolbar rendered.
    const toolbar = page.locator(selectors.toolbar);
    await expect(toolbar).toBeVisible();
  });

  test('editor pane is visible', async () => {
    const editor = page.locator(selectors.editor);
    await expect(editor).toBeVisible();
  });

  test('preview pane is visible', async () => {
    const preview = page.locator(selectors.preview);
    await expect(preview).toBeVisible();
  });

  test('toolbar is present', async () => {
    const toolbar = page.locator(selectors.toolbar);
    await expect(toolbar).toBeVisible();
  });

  test('default snippet renders on load', async () => {
    // Should have SVG in preview from default content
    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();
  });

  test('window title contains GraphvizJS', async () => {
    await expect(page).toHaveTitle(/GraphvizJS/i);
  });
});

test.describe('Toolbar Buttons', () => {
  test('new button is present', async () => {
    const btn = page.locator(selectors.newBtn);
    await expect(btn).toBeVisible();
  });

  test('open button is present', async () => {
    const btn = page.locator(selectors.openBtn);
    await expect(btn).toBeVisible();
  });

  test('save button is present', async () => {
    const btn = page.locator(selectors.saveBtn);
    await expect(btn).toBeVisible();
  });

  test('export button is present', async () => {
    const btn = page.locator(selectors.exportBtn);
    await expect(btn).toBeVisible();
  });

  test('examples button is present', async () => {
    const btn = page.locator(selectors.examplesBtn);
    await expect(btn).toBeVisible();
  });

  test('help button is present', async () => {
    const btn = page.locator(selectors.helpBtn);
    await expect(btn).toBeVisible();
  });
});
