import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ElectronApplication, _electron as electron, expect, Page } from '@playwright/test';

/**
 * Launch the real Electron app via Playwright's Electron runner.
 *
 * Each launch gets its own throwaway `--user-data-dir` so runs are isolated:
 * electron-store persistence (window state, autosave drafts) never leaks between
 * tests, which also prevents the native "recover unsaved draft" dialog — which
 * Playwright cannot dismiss — from ever appearing and hanging the suite.
 *
 * @param env Extra environment variables (e.g. GVJS_E2E_OPEN / GVJS_E2E_SAVE)
 *            merged over the current process env for the launched app.
 */
export async function launchApp(
  env: Record<string, string> = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'gvjs-e2e-'));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ...env } as Record<string, string>,
    // First cold spawn (Electron + WASM init) can be slow; be generous.
    timeout: 60000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

/**
 * Wait for the app to fully initialize (editor and preview loaded)
 */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for editor to be ready (CodeMirror content)
  await page.waitForSelector('.cm-editor', { state: 'visible' });
  // Wait for preview container
  await page.waitForSelector('#preview-host', { state: 'visible' });
  // Wait for initial render (SVG in preview). WASM Graphviz init on a cold
  // start can take a while, so allow a generous timeout.
  await page.waitForSelector('#preview-host svg', { state: 'visible', timeout: 30000 });
}

/**
 * Locator for the active tab's editor content.
 *
 * The app hides inactive tabs by setting `display:none` on their `.cm-editor`
 * root. CodeMirror keeps a cached layout on hidden editors, so Playwright's
 * `:visible` (and DOM `checkVisibility`/`offsetParent`) still report them as
 * visible. The reliable signal is the inline display style the app controls.
 */
export function activeEditorContent(page: Page) {
  return page.locator('.cm-editor:not([style*="none"]) .cm-content').first();
}

export async function getEditorContent(page: Page): Promise<string> {
  return (await activeEditorContent(page).textContent()) ?? '';
}

/**
 * Set the visible editor's content by selecting all and typing.
 */
export async function setEditorContent(page: Page, content: string): Promise<void> {
  const editor = activeEditorContent(page);
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
}

/**
 * Check if the preview shows an error. The renderer toggles the `preview-error`
 * class on the `#preview-host` element itself.
 */
export async function hasPreviewError(page: Page): Promise<boolean> {
  const errorElement = page.locator('#preview-host.preview-error');
  return errorElement.isVisible();
}

/**
 * Get the preview error message text.
 */
export async function getPreviewError(page: Page): Promise<string | null> {
  const errorElement = page.locator('#preview-host.preview-error');
  if (await errorElement.isVisible()) {
    return errorElement.textContent();
  }
  return null;
}

/**
 * Click a toolbar button by its data-action or aria-label.
 */
export async function clickToolbarButton(page: Page, identifier: string): Promise<void> {
  const button = page.locator(
    `.toolbar button[data-action="${identifier}"], .toolbar button[aria-label="${identifier}"]`
  );
  await button.click();
}

/**
 * Open the examples menu and select an example by its visible label.
 */
export async function selectExample(page: Page, exampleName: string): Promise<void> {
  await page.click(selectors.examplesBtn);
  await page.waitForSelector(selectors.examplesMenu, { state: 'visible' });
  await page.click(`${selectors.examplesMenu} .toolbar-menu-item:has-text("${exampleName}")`);
  await waitForPreviewUpdate(page);
}

/**
 * Open the export menu.
 */
export async function openExportMenu(page: Page): Promise<void> {
  await page.click(selectors.exportBtn);
  await page.waitForSelector(selectors.exportMenu, { state: 'visible' });
}

/**
 * Selectors for common elements (aligned with the current Electron DOM).
 */
export const selectors = {
  editor: '.cm-editor',
  editorContent: '.cm-content',
  preview: '#preview-host',
  previewSvg: '#preview-host svg',
  previewError: '#preview-host.preview-error',
  toolbar: '.toolbar',
  newBtn: '[data-action="new-diagram"]',
  openBtn: '[data-action="open-diagram"]',
  saveBtn: '[data-action="save-diagram"]',
  exportBtn: '[data-action="export-menu"]',
  examplesBtn: '[data-action="examples-menu"]',
  helpBtn: '[data-action="help"]',
  zoomIn: '[data-action="zoom-in"]',
  zoomOut: '[data-action="zoom-out"]',
  zoomReset: '[data-action="zoom-reset"]',
  helpDialog: 'dialog.help-dialog',
  exportMenu: '[data-dropdown="export"] .toolbar-menu',
  examplesMenu: '[data-dropdown="examples"] .toolbar-menu',
  exportMenuItem: '[data-dropdown="export"] .toolbar-menu-item',
  examplesMenuItem: '[data-dropdown="examples"] .toolbar-menu-item',
};
