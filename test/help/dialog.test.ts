import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Tauri app API
vi.mock('@tauri-apps/api/app', () => ({
  getName: vi.fn().mockResolvedValue('GraphvizJS'),
  getVersion: vi.fn().mockResolvedValue('1.0.0'),
}));

// Mock Tauri shell plugin
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

describe('help/dialog', () => {
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.resetModules();
    button = document.createElement('button');
    document.body.innerHTML = '';
    document.body.appendChild(button);
  });

  describe('setupHelpDialog()', () => {
    it('handles null button gracefully', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      expect(() => {
        setupHelpDialog(null);
      }).not.toThrow();
    });

    it('registers F1 listener', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      setupHelpDialog(button);
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });

    it('registers click handler on button', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      const addEventListenerSpy = vi.spyOn(button, 'addEventListener');
      setupHelpDialog(button);
      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('Dialog creation', () => {
    it('button click creates dialog element', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);

      // Click the button to create dialog
      button.click();
      // Wait for async dialog creation
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog');
      expect(dialog).not.toBeNull();
    });

    it('dialog contains app name and version', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog');
      const h2 = dialog?.querySelector('h2');
      expect(h2?.textContent).toContain('GraphvizJS');
      expect(h2?.textContent).toContain('v1.0.0');
    });

    it('dialog has close button', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog');
      const closeBtn = dialog?.querySelector('.help-dialog-close');
      expect(closeBtn).not.toBeNull();
    });

    it('dialog contains keyboard shortcuts section', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog');
      const legendTexts = Array.from(dialog?.querySelectorAll('legend') || []).map(
        (l) => l.textContent
      );
      expect(legendTexts).toContain('Keyboard Shortcuts');
    });

    it('close button closes dialog', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);

      const closeBtn = dialog.querySelector('.help-dialog-close') as HTMLButtonElement;
      closeBtn.click();

      expect(dialog.open).toBe(false);
    });

    it('clicking backdrop closes dialog', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);

      // Simulate click on dialog element itself (backdrop)
      const clickEvent = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(clickEvent, 'target', { value: dialog });
      dialog.dispatchEvent(clickEvent);

      expect(dialog.open).toBe(false);
    });

    it('F1 key opens dialog', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);

      const event = new KeyboardEvent('keydown', { key: 'F1', bubbles: true });
      window.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog');
      expect(dialog).not.toBeNull();
    });

    it('Cmd+? opens dialog', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);

      const event = new KeyboardEvent('keydown', { key: '?', metaKey: true, bubbles: true });
      window.dispatchEvent(event);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog = document.querySelector('dialog.help-dialog');
      expect(dialog).not.toBeNull();
    });

    it('reuses existing dialog on subsequent opens', async () => {
      const { setupHelpDialog } = await import('../../src/help/dialog');
      setupHelpDialog(button);

      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialog1 = document.querySelector('dialog.help-dialog');
      (dialog1 as HTMLDialogElement).close();

      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      const dialogs = document.querySelectorAll('dialog.help-dialog');
      expect(dialogs.length).toBe(1);
    });
  });
});
