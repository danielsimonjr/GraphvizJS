import { type ElectronApplication, expect, type Page, test } from '@playwright/test';
import {
  getPreviewError,
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

    // The preview shows a heading and, in a <pre>, the message that Graphviz gave.
    expect(await getPreviewError(page)).toContain('Graphviz could not render this diagram.');
    await expect(page.locator(`${selectors.previewError} pre`)).toContainText(/syntax error/i);
  });

  test('empty editor shows the empty-state message and no diagram', async () => {
    // Start from the error state, so the test shows that an empty editor also clears the error.
    await setEditorContent(page, 'this is not valid DOT syntax {{{');
    await expect.poll(async () => hasPreviewError(page), { timeout: 5000 }).toBe(true);

    await setEditorContent(page, '');

    await expect(page.locator(`${selectors.preview}.preview-empty`)).toContainText(
      'Add DOT markup to see the preview.'
    );
    await expect(page.locator(selectors.previewSvg)).toHaveCount(0);
    await expect(page.locator(selectors.previewError)).toHaveCount(0);
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

  test('preview zoom buttons scale the diagram and show the level', async () => {
    const svg = page.locator(selectors.previewSvg);
    const level = page.locator(selectors.zoomLevel);
    const transform = () => svg.evaluate((element) => (element as SVGElement).style.transform);

    await expect(level).toHaveText('100%');

    await page.locator(selectors.zoomIn).click();
    await expect(level).toHaveText('125%');
    await expect.poll(transform).toBe('scale(1.25)');

    await page.locator(selectors.zoomIn).click();
    await expect(level).toHaveText('150%');
    await expect.poll(transform).toBe('scale(1.5)');

    await page.locator(selectors.zoomOut).click();
    await expect(level).toHaveText('125%');
    await expect.poll(transform).toBe('scale(1.25)');

    await page.locator(selectors.zoomReset).click();
    await expect(level).toHaveText('100%');
    await expect.poll(transform).toBe('scale(1)');

    await page.locator(selectors.zoomOut).click();
    await expect(level).toHaveText('75%');
    await expect.poll(transform).toBe('scale(0.75)');
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
