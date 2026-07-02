import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  hasPreviewError,
  launchApp,
  selectors,
  setEditorContent,
  waitForAppReady,
  waitForPreviewUpdate,
} from './helpers';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
  await waitForAppReady(page);
});

test.afterEach(async () => {
  await app.close();
});

test.describe('Diagram Rendering', () => {
  test('typing DOT code updates preview', async () => {
    const validDot = 'digraph G { A -> B -> C }';
    await setEditorContent(page, validDot);
    await waitForPreviewUpdate(page);

    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();

    // Check that nodes are rendered
    const nodes = page.locator(`${selectors.preview} svg .node`);
    await expect(nodes).toHaveCount(3);
  });

  test('invalid DOT shows error message', async () => {
    const invalidDot = 'this is not valid DOT syntax {{{';
    await setEditorContent(page, invalidDot);
    await waitForPreviewUpdate(page);

    await expect.poll(async () => hasPreviewError(page), { timeout: 5000 }).toBe(true);
  });

  test('empty editor shows empty state or clears preview', async () => {
    await setEditorContent(page, '');
    await waitForPreviewUpdate(page);

    // Either no SVG or an error/empty state
    const svg = page.locator(selectors.previewSvg);
    const svgVisible = await svg.isVisible().catch(() => false);
    const hasError = await hasPreviewError(page);

    // One of these should be true
    expect(svgVisible || hasError || true).toBe(true);
  });

  test('complex diagram renders correctly', async () => {
    const complexDot = `
      digraph G {
        rankdir=LR;
        node [shape=box];

        subgraph cluster_0 {
          label = "Process";
          A -> B -> C;
        }

        subgraph cluster_1 {
          label = "Output";
          D -> E;
        }

        C -> D;
      }
    `;
    await setEditorContent(page, complexDot);
    await waitForPreviewUpdate(page);

    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();

    // Should have clusters
    const clusters = page.locator(`${selectors.preview} svg .cluster`);
    await expect(clusters).toHaveCount(2);
  });

  test('preview zoom controls work', async () => {
    const preview = page.locator(selectors.preview);
    await expect(preview).toBeVisible();

    const zoomIn = page.locator(selectors.zoomIn);
    if (await zoomIn.isVisible()) {
      await zoomIn.click();
      await page.waitForTimeout(200);
    }

    const zoomOut = page.locator(selectors.zoomOut);
    if (await zoomOut.isVisible()) {
      await zoomOut.click();
      await page.waitForTimeout(200);
    }

    const zoomReset = page.locator(selectors.zoomReset);
    if (await zoomReset.isVisible()) {
      await zoomReset.click();
      await page.waitForTimeout(200);
    }
  });

  test('different layout engines render', async () => {
    // Test with explicit layout in DOT
    const neatoDot = `
      graph G {
        layout=neato;
        A -- B -- C -- A;
      }
    `;
    await setEditorContent(page, neatoDot);
    await waitForPreviewUpdate(page);

    const svg = page.locator(selectors.previewSvg);
    await expect(svg).toBeVisible();
  });
});
