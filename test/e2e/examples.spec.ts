import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  getEditorContent,
  launchApp,
  readExamples,
  selectors,
  waitForAppReady,
  withoutWhiteSpace,
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

  test('example selection loads the example text into the editor', async () => {
    const [first] = readExamples();
    // The start text is not the example, so a match after the click comes from the click.
    expect(await getEditorContent(page)).not.toContain(first.title);

    await page.locator(selectors.examplesBtn).click();
    await expect(page.locator(selectors.examplesMenu)).toBeVisible();
    await page.locator(selectors.examplesMenuItem).first().click();

    await expect
      .poll(async () => withoutWhiteSpace(await getEditorContent(page)))
      .toBe(withoutWhiteSpace(first.source));
  });

  test('example renders in preview', async () => {
    const [first] = readExamples();
    const svg = page.locator(selectors.previewSvg);
    // The labels of the example that the first render does not show. The first render holds the
    // start text, so these can appear only after the example has rendered.
    const before = (await svg.textContent()) ?? '';
    const newLabels = first.labels.filter((label) => !before.includes(label));
    expect(newLabels.length).toBeGreaterThan(0);

    await page.locator(selectors.examplesBtn).click();
    await page.locator(selectors.examplesMenuItem).first().click();

    for (const label of newLabels) {
      await expect(svg).toContainText(label);
    }
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

  test('a second example opens in its own tab and the preview follows it', async () => {
    const [first, second] = readExamples();
    const examplesBtn = page.locator(selectors.examplesBtn);
    const tabs = page.locator('[role="tab"]');
    const svg = page.locator(selectors.previewSvg);
    await expect(tabs).toHaveCount(1);

    await examplesBtn.click();
    await page.locator(selectors.examplesMenuItem).first().click();
    await expect(tabs).toHaveCount(2);
    await expect.poll(() => getEditorContent(page)).toContain(first.title);
    for (const label of first.labels) {
      await expect(svg).toContainText(label);
    }

    await examplesBtn.click();
    await page.locator(selectors.examplesMenuItem).nth(1).click();

    await expect(tabs).toHaveCount(3);
    await expect.poll(() => getEditorContent(page)).toContain(second.title);
    expect(await getEditorContent(page)).not.toContain(first.title);
    for (const label of second.labels) {
      await expect(svg).toContainText(label);
    }
    // A label that only the first example has must be gone from the preview.
    const gone = first.labels.find((label) => !second.labels.includes(label));
    expect(gone).toBeDefined();
    await expect(svg).not.toContainText(gone as string);
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
