import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openPdfOptionsDialog } from '../../src/toolbar/pdf-options-dialog';

// happy-dom lacks showModal/close; stub them so the native <dialog> "opens".
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  });
});
afterEach(() => {
  for (const d of document.querySelectorAll('dialog')) {
    d.remove();
  }
});

function dialog(): HTMLDialogElement {
  return document.querySelector('dialog.pdf-options-dialog') as HTMLDialogElement;
}

describe('openPdfOptionsDialog', () => {
  it('defaults to fit/letter/auto and resolves them on Export', async () => {
    const p = openPdfOptionsDialog();
    dialog().querySelector<HTMLButtonElement>('[data-pdf-action="export"]')?.click();
    await expect(p).resolves.toEqual({ mode: 'fit', pageSize: 'letter', orientation: 'auto' });
  });

  it('resolves null on Cancel', async () => {
    const p = openPdfOptionsDialog();
    dialog().querySelector<HTMLButtonElement>('[data-pdf-action="cancel"]')?.click();
    await expect(p).resolves.toBeNull();
  });

  it('returns chosen standard page + size + orientation', async () => {
    const p = openPdfOptionsDialog();
    const d = dialog();
    d.querySelector<HTMLInputElement>('input[name="pdf-mode"][value="standard"]')?.click();
    d.querySelector<HTMLSelectElement>('[data-pdf="size"]')!.value = 'a4';
    d.querySelector<HTMLSelectElement>('[data-pdf="orientation"]')!.value = 'landscape';
    d.querySelector<HTMLButtonElement>('[data-pdf-action="export"]')?.click();
    await expect(p).resolves.toEqual({
      mode: 'standard',
      pageSize: 'a4',
      orientation: 'landscape',
    });
  });

  it('disables size/orientation until Standard page is selected', () => {
    openPdfOptionsDialog();
    const d = dialog();
    expect(d.querySelector<HTMLSelectElement>('[data-pdf="size"]')!.disabled).toBe(true);
    d.querySelector<HTMLInputElement>('input[name="pdf-mode"][value="standard"]')?.click();
    expect(d.querySelector<HTMLSelectElement>('[data-pdf="size"]')!.disabled).toBe(false);
  });
});
