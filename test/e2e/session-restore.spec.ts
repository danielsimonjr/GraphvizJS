import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

function seedSession(userData: string, session: unknown) {
  // electron-store's default file is config.json in userData.
  writeFileSync(join(userData, 'config.json'), JSON.stringify({ session }), 'utf-8');
}

test('restores a seeded multi-tab session silently on launch', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'gvjs-session-'));
  seedSession(userData, {
    tabs: [
      {
        filePath: null,
        content: 'digraph { restored_one }',
        savedContent: 'digraph { restored_one }',
        engine: 'neato',
      },
      {
        filePath: null,
        content: 'digraph { restored_two }',
        savedContent: 'digraph { restored_two }',
        engine: 'dot',
      },
    ],
    activeIndex: 1,
  });

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GVJS_E2E_USERDATA: userData },
  });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  await expect(page.locator('#layout-engine')).toHaveValue('dot');
  await expect(page.locator('#editor-host')).toContainText('restored_two');
  await app.close();
});

test('fresh profile shows a single default snippet tab (parity)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'gvjs-fresh-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GVJS_E2E_USERDATA: userData },
  });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await expect(page.locator('[role="tab"]')).toHaveCount(1);
  await expect(page.locator('#editor-host')).toContainText('Decision');
  await app.close();
});
