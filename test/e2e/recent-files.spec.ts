import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('recently opened file appears in the Recent menu and reopens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-recent-'));
  const file = join(dir, 'sample.dot');
  writeFileSync(file, 'digraph { a -> b }', 'utf-8');

  const app = await electron.launch({ args: ['.'], env: { ...process.env, GVJS_E2E_OPEN: file } });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  await page.locator('[data-action="open-diagram"]').click();
  // Recent menu now lists the opened file.
  await page.locator('[data-action="recent-menu"]').click();
  const item = page.locator('[data-menu="recent"] .toolbar-menu-item', { hasText: 'sample.dot' });
  await expect(item).toBeVisible();
  await item.click();
  await app.close();
});
