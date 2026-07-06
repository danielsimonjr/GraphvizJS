import { onMenuAction } from '../platform';
import type { MenuActionId } from './menu-template';

export interface MenuCommandHandlers {
  new: () => void;
  newTab: () => void;
  open: () => void;
  openRecent: (path: string) => void;
  save: () => void;
  saveAs: () => void;
  export: (format: string) => void;
  closeTab: () => void;
  undo: () => void;
  redo: () => void;
  find: () => void;
  format: () => void;
  setEngine: (engine: string) => void;
  setTheme: (scheme: string) => void;
  commandPalette: () => void;
  preferences: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  help: () => void;
}

/** Route a menu action id (+ optional payload) to its handler. Unknown ids and
 *  payload actions missing their payload are ignored. */
export function dispatchMenuAction(
  handlers: MenuCommandHandlers,
  action: string,
  payload?: string
): void {
  switch (action as MenuActionId) {
    case 'new':
      return handlers.new();
    case 'new-tab':
      return handlers.newTab();
    case 'open':
      return handlers.open();
    case 'open-recent':
      if (payload) handlers.openRecent(payload);
      return;
    case 'save':
      return handlers.save();
    case 'save-as':
      return handlers.saveAs();
    case 'export':
      if (payload) handlers.export(payload);
      return;
    case 'close-tab':
      return handlers.closeTab();
    case 'undo':
      return handlers.undo();
    case 'redo':
      return handlers.redo();
    case 'find':
      return handlers.find();
    case 'format':
      return handlers.format();
    case 'set-engine':
      if (payload) handlers.setEngine(payload);
      return;
    case 'set-theme':
      if (payload) handlers.setTheme(payload);
      return;
    case 'command-palette':
      return handlers.commandPalette();
    case 'preferences':
      return handlers.preferences();
    case 'zoom-in':
      return handlers.zoomIn();
    case 'zoom-out':
      return handlers.zoomOut();
    case 'zoom-reset':
      return handlers.zoomReset();
    case 'help':
      return handlers.help();
    default:
      return;
  }
}

/** Subscribe the dispatcher to the menu:action push channel. */
export function setupMenuCommands(handlers: MenuCommandHandlers): () => void {
  return onMenuAction((action, payload) => dispatchMenuAction(handlers, action, payload));
}
