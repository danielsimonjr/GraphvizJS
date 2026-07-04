import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('installs a native application menu with a File menu', async () => {
  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();

  const labels = await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    return menu ? menu.items.map((i) => i.label) : null;
  });
  expect(labels).not.toBeNull();
  expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Help']));
  await app.close();
});

test('File→New Tab menu item creates a new tab (menu:action round-trip)', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'gvjs-menu-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GVJS_E2E_USERDATA: userData },
  });
  const page = await app.firstWindow();
  await page.locator('#editor-host[data-editor="mounted"]').waitFor();
  await expect(page.locator('[role="tab"]')).toHaveCount(1);

  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()?.getMenuItemById('new-tab')?.click();
  });
  await expect(page.locator('[role="tab"]')).toHaveCount(2);
  await app.close();
});
