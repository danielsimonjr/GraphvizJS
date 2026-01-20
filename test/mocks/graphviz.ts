import { vi } from 'vitest';

const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="blue"/>
</svg>`;

export interface MockGraphvizInstance {
  layout: ReturnType<typeof vi.fn>;
}

// Shared instance for tests that need to track calls
let currentInstance: MockGraphvizInstance | null = null;

export const createMockGraphvizInstance = (): MockGraphvizInstance => ({
  layout: vi.fn().mockReturnValue(DEFAULT_SVG),
});

export const mockGraphviz = {
  load: vi.fn().mockImplementation(async () => {
    currentInstance = createMockGraphvizInstance();
    return currentInstance;
  }),
};

// Get the current mock instance
export function getCurrentInstance(): MockGraphvizInstance | null {
  return currentInstance;
}

// Configure mock to simulate errors
export function configureMockError(error: Error): void {
  mockGraphviz.load.mockImplementation(async () => {
    currentInstance = createMockGraphvizInstance();
    currentInstance.layout.mockImplementation(() => {
      throw error;
    });
    return currentInstance;
  });
}

// Configure mock to return specific SVG
export function configureMockSvg(svg: string): void {
  mockGraphviz.load.mockImplementation(async () => {
    currentInstance = createMockGraphvizInstance();
    currentInstance.layout.mockReturnValue(svg);
    return currentInstance;
  });
}

// Reset mock to default behavior
export function resetMockGraphviz(): void {
  mockGraphviz.load.mockClear();
  currentInstance = null;
  mockGraphviz.load.mockImplementation(async () => {
    currentInstance = createMockGraphvizInstance();
    return currentInstance;
  });
}

// Mock the @hpcc-js/wasm module
vi.mock('@hpcc-js/wasm', () => ({
  Graphviz: mockGraphviz,
}));

export { DEFAULT_SVG };
