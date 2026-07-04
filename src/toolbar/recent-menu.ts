export interface RecentMenuOptions {
  button: HTMLButtonElement | null;
  menu: HTMLDivElement | null;
  getRecent: () => string[];
  onPick: (path: string) => void;
}

function basename(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i >= 0 ? n.slice(i + 1) : n;
}

export function setupRecentMenu({ button, menu, getRecent, onPick }: RecentMenuOptions): void {
  if (!button || !menu) return;
  let isOpen = false;

  const render = () => {
    menu.innerHTML = '';
    const paths = getRecent();
    if (paths.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'toolbar-menu-empty';
      empty.textContent = 'No recent files';
      menu.append(empty);
      return;
    }
    for (const path of paths) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'toolbar-menu-item';
      item.role = 'menuitem';
      item.dataset.path = path;
      item.textContent = basename(path);
      item.title = path;
      menu.append(item);
    }
  };

  const setOpen = (open: boolean) => {
    if (isOpen === open) return;
    isOpen = open;
    button.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    const method: 'addEventListener' | 'removeEventListener' = open
      ? 'addEventListener'
      : 'removeEventListener';
    document[method]('pointerdown', handlePointerDown, true);
  };

  const handlePointerDown = (event: Event) => {
    const target = event.target as Node | null;
    if (!target || menu.contains(target) || button.contains(target)) return;
    setOpen(false);
  };

  button.addEventListener('click', (event) => {
    event.preventDefault();
    if (!isOpen) render();
    setOpen(!isOpen);
  });

  menu.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '.toolbar-menu-item'
    );
    const path = target?.dataset.path;
    if (!path) return;
    event.preventDefault();
    setOpen(false);
    onPick(path);
  });
}
