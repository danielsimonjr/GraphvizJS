import type { PdfExportOptions } from '../../core/types';

/**
 * Open a modal dialog to choose PDF page options. Resolves the chosen options
 * on Export, or `null` on Cancel / Escape / backdrop click. The dialog element
 * is created fresh per call and removed from the DOM when it settles.
 */
export function openPdfOptionsDialog(): Promise<PdfExportOptions | null> {
  return new Promise((resolve) => {
    const el = document.createElement('dialog');
    el.className = 'pdf-options-dialog';
    el.innerHTML = `
      <form class="pdf-options-form" method="dialog">
        <h2>Export PDF</h2>
        <fieldset class="pdf-page-mode">
          <legend>Page</legend>
          <label><input type="radio" name="pdf-mode" value="fit" checked /> Fit page to diagram</label>
          <label><input type="radio" name="pdf-mode" value="standard" /> Standard page</label>
        </fieldset>
        <div class="pdf-standard-opts">
          <label>Size
            <select data-pdf="size" disabled>
              <option value="letter" selected>Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
          <label>Orientation
            <select data-pdf="orientation" disabled>
              <option value="auto" selected>Auto</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
        </div>
        <div class="pdf-options-actions">
          <button type="button" class="pdf-btn-cancel" data-pdf-action="cancel">Cancel</button>
          <button type="button" class="pdf-btn-export" data-pdf-action="export">Export</button>
        </div>
      </form>
    `;

    const sizeSel = el.querySelector<HTMLSelectElement>('[data-pdf="size"]');
    const orientSel = el.querySelector<HTMLSelectElement>('[data-pdf="orientation"]');
    const modeInputs = el.querySelectorAll<HTMLInputElement>('input[name="pdf-mode"]');

    const checkedMode = (): string =>
      el.querySelector<HTMLInputElement>('input[name="pdf-mode"]:checked')?.value ?? 'fit';

    const syncEnabled = () => {
      const standard = checkedMode() === 'standard';
      if (sizeSel) sizeSel.disabled = !standard;
      if (orientSel) orientSel.disabled = !standard;
    };
    for (const input of modeInputs) {
      input.addEventListener('change', syncEnabled);
    }

    let settled = false;
    const finish = (result: PdfExportOptions | null) => {
      if (settled) return;
      settled = true;
      el.close();
      el.remove();
      resolve(result);
    };

    el.querySelector('[data-pdf-action="cancel"]')?.addEventListener('click', () => finish(null));
    el.querySelector('[data-pdf-action="export"]')?.addEventListener('click', () => {
      finish({
        mode: checkedMode() as PdfExportOptions['mode'],
        pageSize: (sizeSel?.value ?? 'letter') as PdfExportOptions['pageSize'],
        orientation: (orientSel?.value ?? 'auto') as PdfExportOptions['orientation'],
      });
    });
    // Escape (native dialog 'cancel' event) and backdrop click resolve null.
    el.addEventListener('cancel', () => finish(null));
    el.addEventListener('click', (event) => {
      if (event.target === el) finish(null);
    });

    document.body.appendChild(el);
    el.showModal();
  });
}
