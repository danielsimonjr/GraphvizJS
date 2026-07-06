/** A runnable command surfaced in the palette. */
export interface Command {
  id: string;
  label: string;
  group?: string;
  run: () => void;
}

/**
 * Subsequence fuzzy score: every query char must appear in `text` in order
 * (case-insensitive). Returns a score where lower is a tighter/earlier match,
 * or null when there is no match. Empty query scores 0.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q === '') return 0;
  let from = 0;
  let score = 0;
  let last = -1;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at === -1) return null;
    score += last === -1 ? at : at - last - 1; // distance-from-start, then gaps
    last = at;
    from = at + 1;
  }
  return score;
}

/** Commands matching `query`, ranked by score (empty query → all, original order). */
export function filterCommands(commands: Command[], query: string): Command[] {
  if (query.trim() === '') return commands;
  return commands
    .map((command, index) => ({ command, index, score: fuzzyScore(query, command.label) }))
    .filter((entry): entry is { command: Command; index: number; score: number } => {
      return entry.score !== null;
    })
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.command);
}

export interface CommandPalette {
  open(): void;
  close(): void;
  isOpen(): boolean;
  readonly element: HTMLElement;
}

/**
 * A keyboard-driven command palette: type to fuzzy-filter, ↑/↓ to move, Enter to
 * run, Esc to dismiss. Renders a hidden overlay into `parent` (default body).
 */
export function createCommandPalette(
  commands: Command[],
  parent: HTMLElement = document.body
): CommandPalette {
  const overlay = document.createElement('div');
  overlay.className = 'command-palette';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.hidden = true;

  const backdrop = document.createElement('div');
  backdrop.className = 'command-palette-backdrop';

  const box = document.createElement('div');
  box.className = 'command-palette-box';

  const input = document.createElement('input');
  input.className = 'command-palette-input';
  input.type = 'text';
  input.setAttribute('placeholder', 'Type a command…');
  input.setAttribute('aria-label', 'Command palette');

  const list = document.createElement('ul');
  list.className = 'command-palette-list';
  list.setAttribute('role', 'listbox');

  box.append(input, list);
  overlay.append(backdrop, box);
  parent.append(overlay);

  let filtered: Command[] = [];
  let selected = 0;

  const renderList = () => {
    filtered = filterCommands(commands, input.value);
    if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
    list.replaceChildren(
      ...filtered.map((command, index) => {
        const item = document.createElement('li');
        item.className = 'command-palette-item';
        item.setAttribute('role', 'option');
        item.textContent = command.label; // textContent, never innerHTML
        if (index === selected) {
          item.classList.add('is-selected');
          item.setAttribute('aria-selected', 'true');
        }
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          runAt(index);
        });
        return item;
      })
    );
  };

  const runAt = (index: number) => {
    const command = filtered[index];
    close();
    command?.run();
  };

  function open(): void {
    input.value = '';
    selected = 0;
    renderList();
    overlay.hidden = false;
    input.focus();
  }

  function close(): void {
    overlay.hidden = true;
  }

  const isOpen = () => !overlay.hidden;

  input.addEventListener('input', () => {
    selected = 0;
    renderList();
  });

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selected = Math.min(selected + 1, filtered.length - 1);
        renderList();
        break;
      case 'ArrowUp':
        event.preventDefault();
        selected = Math.max(selected - 1, 0);
        renderList();
        break;
      case 'Enter':
        event.preventDefault();
        if (filtered.length > 0) runAt(selected);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
    }
  });

  backdrop.addEventListener('mousedown', close);

  return {
    open,
    close,
    isOpen,
    get element() {
      return overlay;
    },
  };
}
