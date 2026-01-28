import type { EditorView } from 'codemirror';
import { type ExampleItem, setupExamplesMenu } from './examples-menu';
import { createExportHandler } from './export-diagram';
import { setupExportMenu } from './export-menu';
import { setupNewDiagramAction } from './new-diagram';
import { setupOpenDiagramAction } from './open-diagram';
import { setupSaveDiagramAction } from './save-diagram';

const EXAMPLES = loadExamples();

export interface ToolbarActionsOptions {
  getEditor: () => EditorView;
  newDiagramButton: HTMLButtonElement | null;
  openButton: HTMLButtonElement | null;
  saveButton: HTMLButtonElement | null;
  exportButton: HTMLButtonElement | null;
  exportMenu: HTMLDivElement | null;
  examplesButton: HTMLButtonElement | null;
  examplesMenu: HTMLDivElement | null;
  commitDocument: (doc: string, options?: { saved?: boolean }) => void;
  onNew: () => void;
  onOpen: (content: string, path: string) => void;
  onLoadExample: (content: string) => void;
  onPathChange: (path: string | null) => void;
  getPath: () => string | null;
}

export function setupToolbarActions(options: ToolbarActionsOptions): void {
  const {
    getEditor,
    newDiagramButton,
    openButton,
    saveButton,
    exportButton,
    exportMenu,
    examplesButton,
    examplesMenu,
    commitDocument,
    onPathChange,
    getPath,
  } = options;

  setupNewDiagramAction({
    button: newDiagramButton,
    onNew: options.onNew,
  });

  setupOpenDiagramAction({
    button: openButton,
    onOpen: options.onOpen,
  });

  setupSaveDiagramAction({
    getEditor,
    button: saveButton,
    getPath,
    onPathChange,
    onSave(doc) {
      commitDocument(doc, { saved: true });
    },
  });

  const handleExport = createExportHandler({
    getEditor,
    getPath,
  });

  setupExportMenu({
    button: exportButton,
    menu: exportMenu,
    onSelect: handleExport,
  });

  if (EXAMPLES.length > 0) {
    setupExamplesMenu({
      button: examplesButton,
      menu: examplesMenu,
      items: EXAMPLES,
      onSelect: (content) => {
        options.onLoadExample(content);
      },
    });
  }
}

function loadExamples(): ExampleItem[] {
  const modules = import.meta.glob('../examples/*.dot', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  return Object.entries(modules)
    .map(([path, content]) => {
      const match = path.match(/\/([^/]+)\.dot$/);
      const id = match?.[1];
      if (!id) return null;
      const { order, name } = parseExampleId(id);
      return {
        id: name,
        label: formatExampleLabel(name),
        content,
        order,
      };
    })
    .filter((item): item is ExampleItem => item !== null)
    .sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.label.localeCompare(b.label);
    });
}

function formatExampleLabel(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function parseExampleId(rawId: string): { name: string; order: number } {
  const [, orderPart, namePart] = rawId.match(/^(\d+)[-_](.+)$/) ?? [];
  if (orderPart && namePart) {
    return {
      name: namePart,
      order: Number.parseInt(orderPart, 10),
    };
  }
  return { name: rawId, order: Number.MAX_SAFE_INTEGER };
}
