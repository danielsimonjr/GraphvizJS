import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupOpenDiagramAction } from '../../src/toolbar/open-diagram';

vi.mock('../../src/platform', () => ({ openTextFile: vi.fn() }));

import { openTextFile } from '../../src/platform';

beforeEach(() => vi.clearAllMocks());

describe('setupOpenDiagramAction', () => {
  it('reads the picked file and calls onOpen with content + path', async () => {
    (openTextFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      path: '/g.dot',
      content: 'digraph{}',
    });
    const button = document.createElement('button');
    const onOpen = vi.fn();
    setupOpenDiagramAction({ button, onOpen });
    button.click();
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith('digraph{}', '/g.dot'));
    expect(openTextFile).toHaveBeenCalledWith([
      { name: 'DOT Diagram', extensions: ['dot', 'gv'] },
      { name: 'All Files', extensions: ['*'] },
    ]);
  });

  it('does nothing when the dialog is cancelled', async () => {
    (openTextFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const button = document.createElement('button');
    const onOpen = vi.fn();
    setupOpenDiagramAction({ button, onOpen });
    button.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
