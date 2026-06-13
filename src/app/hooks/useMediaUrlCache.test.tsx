import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useMediaUrlCache } from './useMediaUrlCache';

describe('useMediaUrlCache', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a stable cache API across rerenders', () => {
    const { result, rerender } = renderHook(() => useMediaUrlCache());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('revokes tracked blob URLs when clearing the cache', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const { result } = renderHook(() => useMediaUrlCache());

    result.current.setBlob('mxc://example.org/image', false, 'blob:first');
    result.current.setBlob('mxc://example.org/video', true, 'blob:second');

    result.current.clear();

    expect(revokeSpy).toHaveBeenCalledWith('blob:first');
    expect(revokeSpy).toHaveBeenCalledWith('blob:second');
  });
});
