import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/utils/debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('only executes once for rapid calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('executes with correct arguments', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('arg1', 'arg2');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('resets timer on new calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);

    debouncedFn();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handles zero delay', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 0);

    debouncedFn();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("preserves 'this' context", () => {
    const obj = {
      value: 42,
      fn: vi.fn(function (this: { value: number }) {
        return this.value;
      }),
    };

    const debouncedFn = debounce(obj.fn.bind(obj), 100);
    debouncedFn();

    vi.advanceTimersByTime(100);
    expect(obj.fn).toHaveBeenCalled();
  });
});
