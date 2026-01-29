import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentEngine,
  resetLayoutEngineCache,
  setupLayoutEngine,
} from '../../src/toolbar/layout-engine';

describe('toolbar/layout-engine', () => {
  let selectElement: HTMLSelectElement;

  beforeEach(() => {
    // Reset the cached select element between tests
    resetLayoutEngineCache();
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
      resetLayoutEngineCache();
      const callback = vi.fn();

      // Should not throw
      expect(() => setupLayoutEngine(callback)).not.toThrow();
    });
  });

  describe('resetLayoutEngineCache()', () => {
    it('clears cached select element', () => {
      // First call caches the element
      expect(getCurrentEngine()).toBe('dot');

      // Remove element from DOM and reset cache
      document.body.innerHTML = '';
      resetLayoutEngineCache();

      // Should return default since element is gone
      expect(getCurrentEngine()).toBe('dot');
    });

    it('allows re-caching after reset', () => {
      // Cache initial element
      getCurrentEngine();

      // Create a new select with different value
      document.body.innerHTML = '';
      resetLayoutEngineCache();

      const newSelect = document.createElement('select');
      newSelect.id = 'layout-engine';
      const option = document.createElement('option');
      option.value = 'neato';
      option.selected = true;
      newSelect.appendChild(option);
      document.body.appendChild(newSelect);

      // Should find new element after reset
      expect(getCurrentEngine()).toBe('neato');
    });
  });
});
