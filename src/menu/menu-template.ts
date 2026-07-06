import type { MenuItemConstructorOptions } from 'electron';
// Type-only: keeps color-scheme's renderer-only `store` import out of the
// main-process menu build (this template is built in the main process).
import type { ColorScheme } from '../theme/color-scheme';

export type MenuActionId =
  | 'new'
  | 'new-tab'
  | 'open'
  | 'open-recent'
  | 'save'
  | 'save-as'
  | 'export'
  | 'close-tab'
  | 'undo'
  | 'redo'
  | 'find'
  | 'format'
  | 'set-engine'
  | 'set-theme'
  | 'command-palette'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'help';

export interface MenuBuildOptions {
  isMac: boolean;
  isDev: boolean;
  recentFiles: string[];
  /** Current color-scheme choice, for the Theme submenu's radio state. */
  currentTheme: ColorScheme;
  onAction: (action: MenuActionId, payload?: string) => void;
  onOpenSource: () => void;
  onAbout: () => void;
}

/** Theme submenu options — kept local so the main-process build stays decoupled. */
const THEME_ITEMS: { readonly scheme: ColorScheme; readonly label: string }[] = [
  { scheme: 'system', label: 'System' },
  { scheme: 'light', label: 'Light' },
  { scheme: 'dark', label: 'Dark' },
];

export const LAYOUT_ENGINES: readonly string[] = [
  'dot',
  'neato',
  'fdp',
  'sfdp',
  'circo',
  'twopi',
  'osage',
  'patchwork',
];

function basename(p: string): string {
  const normalized = p.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function buildOpenRecentSubmenu(opts: MenuBuildOptions): MenuItemConstructorOptions[] {
  if (opts.recentFiles.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }];
  }
  return opts.recentFiles.map((path, i) => ({
    label: basename(path),
    id: `recent:${i}`,
    click: () => opts.onAction('open-recent', path),
  }));
}

function buildAppMenu(opts: MenuBuildOptions): MenuItemConstructorOptions {
  return {
    label: 'GraphvizJS',
    submenu: [
      { id: 'about-mac', label: 'About GraphvizJS', click: () => opts.onAbout() },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };
}

function buildFileMenu(opts: MenuBuildOptions): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    {
      id: 'new',
      label: 'New',
      accelerator: 'CmdOrCtrl+N',
      registerAccelerator: false,
      click: () => opts.onAction('new'),
    },
    {
      id: 'new-tab',
      label: 'New Tab',
      accelerator: 'CmdOrCtrl+T',
      registerAccelerator: false,
      click: () => opts.onAction('new-tab'),
    },
    {
      id: 'open',
      label: 'Open…',
      accelerator: 'CmdOrCtrl+O',
      registerAccelerator: false,
      click: () => opts.onAction('open'),
    },
    {
      label: 'Open Recent',
      submenu: buildOpenRecentSubmenu(opts),
    },
    { type: 'separator' },
    {
      id: 'save',
      label: 'Save',
      accelerator: 'CmdOrCtrl+S',
      registerAccelerator: false,
      click: () => opts.onAction('save'),
    },
    {
      id: 'save-as',
      label: 'Save As…',
      accelerator: 'CmdOrCtrl+Shift+S',
      registerAccelerator: false,
      click: () => opts.onAction('save-as'),
    },
    { type: 'separator' },
    {
      label: 'Export',
      submenu: [
        { id: 'export:png', label: 'PNG', click: () => opts.onAction('export', 'png') },
        { id: 'export:pngx2', label: 'PNG ×2', click: () => opts.onAction('export', 'pngx2') },
        { id: 'export:svg', label: 'SVG', click: () => opts.onAction('export', 'svg') },
        { id: 'export:pdf', label: 'PDF…', click: () => opts.onAction('export', 'pdf') },
      ],
    },
    { type: 'separator' },
    {
      id: 'close-tab',
      label: 'Close Tab',
      accelerator: 'CmdOrCtrl+W',
      registerAccelerator: false,
      click: () => opts.onAction('close-tab'),
    },
  ];

  if (!opts.isMac) {
    submenu.push({ type: 'separator' }, { role: 'quit' });
  }

  return { label: 'File', submenu };
}

function buildEditMenu(opts: MenuBuildOptions): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      {
        id: 'undo',
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        registerAccelerator: false,
        click: () => opts.onAction('undo'),
      },
      {
        id: 'redo',
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Y',
        registerAccelerator: false,
        click: () => opts.onAction('redo'),
      },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        id: 'find',
        label: 'Find',
        accelerator: 'CmdOrCtrl+F',
        registerAccelerator: false,
        click: () => opts.onAction('find'),
      },
      {
        id: 'format',
        label: 'Format Document',
        accelerator: 'Shift+Alt+F',
        registerAccelerator: false,
        click: () => opts.onAction('format'),
      },
    ],
  };
}

function buildViewMenu(opts: MenuBuildOptions): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    {
      id: 'command-palette',
      label: 'Command Palette…',
      // The renderer owns this shortcut (label-only here, no double-fire).
      accelerator: 'CmdOrCtrl+Shift+P',
      registerAccelerator: false,
      click: () => opts.onAction('command-palette'),
    },
    { type: 'separator' },
    {
      label: 'Layout Engine',
      submenu: LAYOUT_ENGINES.map((engine) => ({
        id: `engine:${engine}`,
        label: engine,
        click: () => opts.onAction('set-engine', engine),
      })),
    },
    {
      label: 'Theme',
      submenu: THEME_ITEMS.map(({ scheme, label }) => ({
        id: `theme:${scheme}`,
        label,
        type: 'radio' as const,
        checked: opts.currentTheme === scheme,
        click: () => opts.onAction('set-theme', scheme),
      })),
    },
    { type: 'separator' },
    {
      id: 'zoom-in',
      label: 'Zoom In',
      accelerator: 'CmdOrCtrl+=',
      registerAccelerator: false,
      click: () => opts.onAction('zoom-in'),
    },
    {
      id: 'zoom-out',
      label: 'Zoom Out',
      accelerator: 'CmdOrCtrl+-',
      registerAccelerator: false,
      click: () => opts.onAction('zoom-out'),
    },
    {
      id: 'zoom-reset',
      label: 'Reset Zoom',
      accelerator: 'CmdOrCtrl+0',
      registerAccelerator: false,
      click: () => opts.onAction('zoom-reset'),
    },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  if (opts.isDev) {
    submenu.push({ role: 'reload' }, { role: 'toggleDevTools' });
  }

  return { label: 'View', submenu };
}

function buildHelpMenu(opts: MenuBuildOptions): MenuItemConstructorOptions {
  const submenu: MenuItemConstructorOptions[] = [
    {
      id: 'help',
      label: 'Keyboard Shortcuts',
      accelerator: 'F1',
      registerAccelerator: false,
      click: () => opts.onAction('help'),
    },
    { type: 'separator' },
    {
      id: 'view-source',
      label: 'View Source on GitHub',
      click: () => opts.onOpenSource(),
    },
  ];

  if (!opts.isMac) {
    submenu.push({ id: 'about', label: 'About GraphvizJS', click: () => opts.onAbout() });
  }

  return { label: 'Help', submenu };
}

export function buildMenuTemplate(opts: MenuBuildOptions): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [
    buildFileMenu(opts),
    buildEditMenu(opts),
    buildViewMenu(opts),
    buildHelpMenu(opts),
  ];

  if (opts.isMac) {
    template.unshift(buildAppMenu(opts));
  }

  return template;
}
