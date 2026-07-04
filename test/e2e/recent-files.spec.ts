import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('recently opened file appears in the Recent menu and reopens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gvjs-recent-'));
  const file = join(dir, 'sample.dot');
  writeFileSync(file, 'digraph { a -> b }', 'utf-8');

  const { app, page } = await launchApp({ GVJS_E2E_OPEN: file });
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  await page.locator('[data-action="open-diagram"]').click();
  // Recent menu now lists the opened file.
  await page.locator('[data-action="recent-menu"]').click();
  const item = page.locator('[data-menu="recent"] .toolbar-menu-item', { hasText: 'sample.dot' });
  await expect(item).toBeVisible();
  await item.click();
  await app.close();
});
