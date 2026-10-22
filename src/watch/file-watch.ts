import { onFileChanged, setWatchedPaths } from '../platform';

/**
 * Describes the getOpenPaths function and the callback for external file changes.
 */
export interface FileWatchOptions {
  getOpenPaths: () => string[];
  onExternalChange: (path: string) => void | Promise<void>;
}

/** Subscribe to external file changes and keep the main-process watch set in sync. */
export function setupFileWatch({ getOpenPaths, onExternalChange }: FileWatchOptions): {
  sync: () => void;
  dispose: () => void;
} {
  const unsubscribe = onFileChanged((path) => {
    void onExternalChange(path);
  });
  const sync = () => {
    void setWatchedPaths(getOpenPaths());
  };
  sync();
  return { sync, dispose: unsubscribe };
}
