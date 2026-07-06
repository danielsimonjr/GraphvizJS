import { describe, expect, it, vi } from 'vitest';
import {
  type Command,
  createCommandPalette,
  filterCommands,
  fuzzyScore,
} from '../../src/palette/command-palette';

describe('fuzzyScore', () => {
  it('matches a subsequence (case-insensitive) and rejects a non-subsequence', () => {
    expect(fuzzyScore('opn', 'Open')).not.toBeNull();
    expect(fuzzyScore('svg', 'Export SVG')).not.toBeNull();
    expect(fuzzyScore('xyz', 'Open')).toBeNull();
  });
  it('scores a tighter/earlier match lower (better)', () => {
    const contiguous = fuzzyScore('sv', 'SVG export') as number;
    const gappy = fuzzyScore('sv', 'Save file view') as number;
    expect(contiguous).toBeLessThan(gappy);
  });
  it('returns 0 for an empty query', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

const cmds = (): Command[] => [
  { id: 'open', label: 'Open File', run: vi.fn() },
  { id: 'save', label: 'Save File', run: vi.fn() },
  { id: 'svg', label: 'Export SVG', run: vi.fn() },
];

describe('filterCommands', () => {
  it('returns all commands (original order) for an empty query', () => {
    expect(filterCommands(cmds(), '  ').map((c) => c.id)).toEqual(['open', 'save', 'svg']);
  });
  it('keeps only matches and drops non-matches', () => {
    const result = filterCommands(cmds(), 'sv').map((c) => c.id);
    expect(result).toEqual(expect.arrayContaining(['save', 'svg']));
    expect(result).not.toContain('open'); // no 's' in "Open File"
  });
  it('ranks an earlier match ahead of a later one', () => {
    const list: Command[] = [
      { id: 'far', label: 'Zzz SVG', run: vi.fn() }, // "svg" at index 4
      { id: 'near', label: 'SVG Export', run: vi.fn() }, // "svg" at index 0
    ];
    expect(filterCommands(list, 'svg').map((c) => c.id)).toEqual(['near', 'far']);
  });
});

describe('createCommandPalette', () => {
  const setup = () => {
    document.body.innerHTML = '';
    const run = { open: vi.fn(), save: vi.fn(), svg: vi.fn() };
    const commands: Command[] = [
      { id: 'open', label: 'Open File', run: run.open },
      { id: 'save', label: 'Save File', run: run.save },
      { id: 'svg', label: 'Export SVG', run: run.svg },
    ];
    const palette = createCommandPalette(commands);
    const input = () => palette.element.querySelector<HTMLInputElement>('.command-palette-input')!;
    const items = () =>
      [...palette.element.querySelectorAll<HTMLElement>('.command-palette-item')];
    const type = (value: string) => {
      input().value = value;
      input().dispatchEvent(new Event('input', { bubbles: true }));
    };
    const key = (k: string) =>
      input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    return { palette, run, input, items, type, key };
  };

  it('opens hidden→visible and lists all commands', () => {
    const { palette, items } = setup();
    expect(palette.isOpen()).toBe(false);
    palette.open();
    expect(palette.isOpen()).toBe(true);
    expect(items()).toHaveLength(3);
  });

  it('filters as you type', () => {
    const { palette, items, type } = setup();
    palette.open();
    type('save');
    expect(items().map((i) => i.textContent)).toEqual(['Save File']);
  });

  it('runs the selected command on Enter and closes', () => {
    const { palette, run, type, key } = setup();
    palette.open();
    type('svg');
    key('Enter');
    expect(run.svg).toHaveBeenCalledTimes(1);
    expect(palette.isOpen()).toBe(false);
  });

  it('moves selection with arrows and runs the highlighted command', () => {
    const { palette, run, key } = setup();
    palette.open(); // selection starts at index 0 (Open File)
    key('ArrowDown'); // → Save File
    key('Enter');
    expect(run.save).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape without running anything', () => {
    const { palette, run, key } = setup();
    palette.open();
    key('Escape');
    expect(palette.isOpen()).toBe(false);
    expect(run.open).not.toHaveBeenCalled();
  });
});
