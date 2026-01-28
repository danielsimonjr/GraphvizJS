interface NavigatorUAData {
  platform: string;
}

export interface ToolbarShortcutsOptions {
  newButton?: HTMLButtonElement | null;
  openButton?: HTMLButtonElement | null;
  saveButton?: HTMLButtonElement | null;
  onNewTab?: () => void;
  onCloseTab?: () => void;
  onNextTab?: () => void;
  onPreviousTab?: () => void;
}

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

    if (key === 's' && trigger(options.saveButton)) {
      event.preventDefault();
      return;
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
