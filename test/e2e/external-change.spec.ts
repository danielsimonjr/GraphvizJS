import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { activeEditorContent } from './helpers';

test('a clean tab auto-reloads when its file changes on disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-ext-'));
  const file = join(dir, 'watched.dot');
  writeFileSync(file, 'digraph { before_edit }', 'utf-8');

  const app = await electron.launch({ args: ['.'], env: { ...process.env, GVJS_E2E_OPEN: file } });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await page.locator('[data-action="open-diagram"]').click();
  await expect(page.locator('#editor-host')).toContainText('before_edit');

  writeFileSync(file, 'digraph { after_edit }', 'utf-8');
  await expect(page.locator('#editor-host')).toContainText('after_edit', { timeout: 5000 });
  await app.close();
});

test('a dirty tab keeps edits when the reload prompt is cancelled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-ext-dirty-'));
  const file = join(dir, 'watched.dot');
  writeFileSync(file, 'digraph { base }', 'utf-8');

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GVJS_E2E_OPEN: file, GVJS_E2E_CONFIRM: 'cancel' },
  });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await page.locator('[data-action="open-diagram"]').click();

  // Make the tab dirty.
  await activeEditorContent(page).click();
  await page.keyboard.type(' // my edit');
  await expect(page.locator('[data-status="file"]')).toContainText('Unsaved');

  // Change the file on disk; cancel the reload -> edit is preserved.
  writeFileSync(file, 'digraph { changed_on_disk }', 'utf-8');
  await expect(page.locator('#editor-host')).toContainText('my edit', { timeout: 5000 });
  await expect(page.locator('#editor-host')).not.toContainText('changed_on_disk');
  await app.close();
});
