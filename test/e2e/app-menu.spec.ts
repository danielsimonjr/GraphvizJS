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
