import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { launchApp, setEditorContent, waitForAppReady, waitForPreviewUpdate } from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('Graph Statistics', () => {
  test('shows graph statistics for the current diagram', async () => {
    // Replace the editor content with a known cyclic 3-node graph.
    await setEditorContent(page, 'digraph { a -> b -> c -> a }');
    await waitForPreviewUpdate(page);

    // Open the command palette and run the stats command.
    await page.keyboard.press('ControlOrMeta+Shift+P');
    await page.waitForSelector('.command-palette:not([hidden])');
    await page.keyboard.type('graph stat');
    await page.keyboard.press('Enter');

    const dialog = page.locator('.stats-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Nodes');
    await expect(dialog).toContainText('3');
    await expect(dialog).toContainText('Cyclic');
    await expect(dialog).toContainText('yes');
  });
});
