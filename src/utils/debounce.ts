/**
 * Return a function that calls fn after calls stop for wait milliseconds.
 * Only the arguments of the last call reach fn, and the return value of fn is discarded.
 *
 * @param fn - The function to call after the quiet period.
 * @param wait - The quiet period in milliseconds, counted from the last call.
 * @returns A function that takes the arguments of fn and restarts the timer on each call.
 */
export function debounce<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  wait: number
): (...args: TArgs) => void {
  let timeoutId: number | undefined;
  return (...args: TArgs) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      void fn(...args);
    }, wait);
  };
}
