import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentEngine, setupLayoutEngine } from '../../src/toolbar/layout-engine';

describe('toolbar/layout-engine', () => {
  let selectElement: HTMLSelectElement;

  beforeEach(() => {
    // Create and append select element to document
    selectElement = document.createElement('select');
    selectElement.id = 'layout-engine';

    // Add options
    const engines = [
      { value: 'dot', label: 'dot (hierarchical)' },
      { value: 'neato', label: 'neato (spring model)' },
      { value: 'fdp', label: 'fdp (force-directed)' },
      { value: 'sfdp', label: 'sfdp (scalable fdp)' },
      { value: 'circo', label: 'circo (circular)' },
      { value: 'twopi', label: 'twopi (radial)' },
      { value: 'osage', label: 'osage (array-based)' },
      { value: 'patchwork', label: 'patchwork (squarified)' },
    ];

    for (const engine of engines) {
      const option = document.createElement('option');
      option.value = engine.value;
      option.textContent = engine.label;
      if (engine.value === 'dot') {
        option.selected = true;
      }
      selectElement.appendChild(option);
    }

    document.body.appendChild(selectElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('getCurrentEngine()', () => {
    it('returns default engine (dot) when select has default value', () => {
      expect(getCurrentEngine()).toBe('dot');
    });

    it('returns selected engine value', () => {
      selectElement.value = 'neato';
      expect(getCurrentEngine()).toBe('neato');
    });

    it('returns dot when select element not found', () => {
      document.body.innerHTML = '';
      expect(getCurrentEngine()).toBe('dot');
    });

    it('returns each engine correctly', () => {
      const engines = ['dot', 'neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork'];

      for (const engine of engines) {
        selectElement.value = engine;
        expect(getCurrentEngine()).toBe(engine);
      }
    });
  });

  describe('setupLayoutEngine()', () => {
    it('registers change event listener', () => {
      const addEventListenerSpy = vi.spyOn(selectElement, 'addEventListener');
      const callback = vi.fn();

      setupLayoutEngine(callback);

      expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('calls callback with selected engine on change', () => {
      const callback = vi.fn();
      setupLayoutEngine(callback);

      // Change to neato
      selectElement.value = 'neato';
      selectElement.dispatchEvent(new Event('change'));

      expect(callback).toHaveBeenCalledWith('neato');
    });

    it('calls callback with each engine on change', () => {
      const callback = vi.fn();
      setupLayoutEngine(callback);

      const engines = ['neato', 'fdp', 'sfdp', 'circo', 'twopi', 'osage', 'patchwork'];

      for (const engine of engines) {
        selectElement.value = engine;
        selectElement.dispatchEvent(new Event('change'));
        expect(callback).toHaveBeenCalledWith(engine);
      }

      expect(callback).toHaveBeenCalledTimes(engines.length);
    });

    it('does nothing when select element not found', () => {
      document.body.innerHTML = '';
      const callback = vi.fn();

      // Should not throw
      expect(() => setupLayoutEngine(callback)).not.toThrow();
    });
  });
});
