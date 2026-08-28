import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateObjectURL } from './useObjectURL';

describe('useCreateObjectURL', () => {
  let created: number;

  beforeEach(() => {
    vi.restoreAllMocks();
    created = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      created += 1;
      return `blob:url-${created}`;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('revokes the owned url on unmount', async () => {
    const { result, unmount } = renderHook(() => useCreateObjectURL());
    await act(async () => {
      await result.current(new Blob(['a']));
    });

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
  });

  it('revokes the previous url when a new one replaces it', async () => {
    const { result } = renderHook(() => useCreateObjectURL());
    await act(async () => {
      await result.current(new Blob(['a']));
    });
    await act(async () => {
      await result.current(new Blob(['b']));
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:url-1');
  });

  it('revokes immediately when the blob resolves after unmount', async () => {
    const { result, unmount } = renderHook(() => useCreateObjectURL());
    unmount();

    await result.current(new Blob(['late']));

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
  });

  it('does not revoke the current url when an older request resolves last', async () => {
    let resolveOlder!: (blob: Blob) => void;
    const olderBlob = new Promise<Blob>((resolve) => {
      resolveOlder = resolve;
    });
    const { result } = renderHook(() => useCreateObjectURL());

    const olderUrl = result.current(olderBlob);
    await act(async () => {
      await result.current(new Blob(['newer']));
    });
    resolveOlder(new Blob(['older']));
    await olderUrl;

    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:url-2');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:url-1');
  });

  it('keeps a stable identity so it can sit in effect dependencies', () => {
    const { result, rerender } = renderHook(() => useCreateObjectURL());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
