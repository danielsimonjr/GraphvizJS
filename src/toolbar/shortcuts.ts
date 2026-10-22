interface NavigatorUAData {
  platform: string;
}

/**
 * Describes the buttons and tab callbacks that setupToolbarShortcuts uses.
 */
export interface ToolbarShortcutsOptions {
  newButton?: HTMLButtonElement | null;
  openButton?: HTMLButtonElement | null;
  saveButton?: HTMLButtonElement | null;
  saveAsButton?: HTMLButtonElement | null;
  onNewTab?: () => void;
  onCloseTab?: () => void;
  onNextTab?: () => void;
  onPreviousTab?: () => void;
}

/**
 * Register the toolbar and tab keyboard shortcuts on the window.
 * The listener uses the capture phase and skips an event that is already prevented.
 *
 * @param options - The buttons and tab callbacks. A missing or disabled entry ignores its key.
 * @returns A function that removes the keydown listener.
 */
export function setupToolbarShortcuts(options: ToolbarShortcutsOptions): () => void {
  const userAgentData = (navigator as Navigator & { userAgentData?: NavigatorUAData })
    .userAgentData;
  const platform = userAgentData?.platform ?? navigator.platform;
  const isMac = /mac/i.test(platform);

  const handler = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.repeat) return;

    const modifierPressed = isMac ? event.metaKey : event.ctrlKey;
    if (!modifierPressed || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 's') {
      if (event.shiftKey) {
        if (trigger(options.saveAsButton)) {
          event.preventDefault();
          return;
        }
      } else if (trigger(options.saveButton)) {
        event.preventDefault();
        return;
      }
    }

    if (key === 'o' && trigger(options.openButton)) {
      event.preventDefault();
      return;
    }

    if (key === 'n' && trigger(options.newButton)) {
      event.preventDefault();
      return;
    }

    if (key === 't' && !event.shiftKey && options.onNewTab) {
      event.preventDefault();
      options.onNewTab();
      return;
    }

    if (key === 'w' && !event.shiftKey && options.onCloseTab) {
      event.preventDefault();
      options.onCloseTab();
      return;
    }

    if (key === 'tab' && options.onNextTab && options.onPreviousTab) {
      event.preventDefault();
      if (event.shiftKey) {
        options.onPreviousTab();
      } else {
        options.onNextTab();
      }
    }
  };

  const listenerOptions = { capture: true } as const;
  window.addEventListener('keydown', handler, listenerOptions);

  return () => {
    window.removeEventListener('keydown', handler, listenerOptions);
  };
}

function trigger(button?: HTMLButtonElement | null): boolean {
  if (!button || button.disabled) {
    return false;
  }
  button.click();
  return true;
}
