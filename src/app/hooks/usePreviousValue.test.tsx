// Integration tests: renders a real React component tree via renderHook.
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePreviousValue } from './usePreviousValue';

describe('usePreviousValue', () => {
  it('returns the initial value on the first render', () => {
    const { result } = renderHook(() => usePreviousValue('current', 'initial'));
    expect(result.current).toBe('initial');
  });

  it('returns the previous value after a prop update', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => usePreviousValue(value, 'initial'),
      { initialProps: { value: 'first' } }
    );

    // Before any update: returns initial
    expect(result.current).toBe('initial');

    rerender({ value: 'second' });
    expect(result.current).toBe('first');

    rerender({ value: 'third' });
    expect(result.current).toBe('second');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(({ n }: { n: number }) => usePreviousValue(n, 0), {
      initialProps: { n: 1 },
    });

    expect(result.current).toBe(0);
    rerender({ n: 42 });
    expect(result.current).toBe(1);
  });

  it('works with object values (reference equality)', () => {
    const a = { x: 1 };
    const b = { x: 2 };

    const { result, rerender } = renderHook(
      ({ obj }: { obj: { x: number } }) => usePreviousValue(obj, a),
      { initialProps: { obj: a } }
    );

    expect(result.current).toBe(a);
    rerender({ obj: b });
    expect(result.current).toBe(a);
  });
});
