import { Page, expect } from '@playwright/test';

/**
 * Wait for the app to fully initialize (editor and preview loaded)
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for editor to be ready (CodeMirror content)
  await page.waitForSelector('.cm-editor', { state: 'visible' });
  // Wait for preview container
  await page.waitForSelector('#preview', { state: 'visible' });
  // Wait for initial render (SVG in preview)
  await page.waitForSelector('#preview svg', { state: 'visible', timeout: 10000 });
}

/**
 * Get the editor content
 */
export async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = document.querySelector('.cm-content');
    return editor?.textContent || '';
  });
}

/**
 * Set the editor content by selecting all and typing
 */
export async function setEditorContent(page: Page, content: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  // Select all and replace
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(content);
}

/**
 * Wait for the preview to update with new SVG
 */
export async function waitForPreviewUpdate(page: Page): Promise<void> {
  // Wait for any pending render (debounced)
  await page.waitForTimeout(500);
  await page.waitForSelector('#preview svg', { state: 'visible' });
}

/**
 * Check if the preview shows an error
 */
export async function hasPreviewError(page: Page): Promise<boolean> {
  const errorElement = page.locator('#preview .preview-error');
  return errorElement.isVisible();
}

/**
 * Get the preview error message
 */
export async function getPreviewError(page: Page): Promise<string | null> {
  const errorElement = page.locator('#preview .preview-error');
  if (await errorElement.isVisible()) {
    return errorElement.textContent();
  }
  return null;
}

/**
 * Click a toolbar button by its ID or aria-label
 */
export async function clickToolbarButton(page: Page, identifier: string): Promise<void> {
  const button = page.locator(`#toolbar button#${identifier}, #toolbar button[aria-label="${identifier}"]`);
  await button.click();
}

/**
 * Open the examples menu and select an example
 */
export async function selectExample(page: Page, exampleName: string): Promise<void> {
  await page.click('#examples-btn');
  await page.waitForSelector('.examples-menu', { state: 'visible' });
  await page.click(`.examples-menu button:has-text("${exampleName}")`);
  await waitForPreviewUpdate(page);
}

/**
 * Open the export menu
 */
export async function openExportMenu(page: Page): Promise<void> {
  await page.click('#export-btn');
  await page.waitForSelector('.export-menu', { state: 'visible' });
}

/**
 * Selectors for common elements
 */
export const selectors = {
  editor: '.cm-editor',
  editorContent: '.cm-content',
  preview: '#preview',
  previewSvg: '#preview svg',
  previewError: '#preview .preview-error',
  toolbar: '#toolbar',
  newBtn: '#new-btn',
  openBtn: '#open-btn',
  saveBtn: '#save-btn',
  exportBtn: '#export-btn',
  examplesBtn: '#examples-btn',
  helpBtn: '#help-btn',
  zoomIn: '#zoom-in-btn',
  zoomOut: '#zoom-out-btn',
  zoomReset: '#zoom-reset-btn',
  helpDialog: 'dialog.help-dialog',
  exportMenu: '.export-menu',
  examplesMenu: '.examples-menu',
};
