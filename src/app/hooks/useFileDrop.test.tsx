import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { RefObject } from 'react';
import { useFileDropZone } from './useFileDrop';

// jsdom has no DragEvent/DataTransfer constructors, so drag events are faked
// with a plain Event carrying a minimal `dataTransfer` stand-in.
type FakeDataTransfer = { types: string[] } | { files: File[] };

const fireDragEvent = (target: HTMLElement, type: string, dataTransfer?: FakeDataTransfer) => {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'dataTransfer', { value: dataTransfer, configurable: true });
  act(() => {
    target.dispatchEvent(evt);
  });
};

const setupZone = () => {
  const target = document.createElement('div');
  const zoneRef: RefObject<HTMLElement> = { current: target };
  return { target, zoneRef };
};

describe('useFileDropZone', () => {
  it('ignores drags that do not contain files', () => {
    const { target, zoneRef } = setupZone();
    const onDrop = vi.fn<(files: File[]) => void>();
    const { result } = renderHook(() => useFileDropZone(zoneRef, onDrop));

    fireDragEvent(target, 'dragenter', { types: ['text/plain', 'text/uri-list'] });
    fireDragEvent(target, 'dragover');
    fireDragEvent(target, 'dragleave');

    expect(result.current).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('activates on dragenter with files and only deactivates on dragleave after dragover', () => {
    const { target, zoneRef } = setupZone();
    const { result } = renderHook(() => useFileDropZone(zoneRef, vi.fn()));

    fireDragEvent(target, 'dragenter', { types: ['Files'] });
    expect(result.current).toBe(true);

    // start -> leave is not enough; a dragover must happen first.
    fireDragEvent(target, 'dragleave');
    expect(result.current).toBe(true);

    fireDragEvent(target, 'dragover');
    expect(result.current).toBe(true);

    fireDragEvent(target, 'dragleave');
    expect(result.current).toBe(false);
  });

  it('invokes onDrop with the dropped files and deactivates the zone', () => {
    const { target, zoneRef } = setupZone();
    const onDrop = vi.fn<(files: File[]) => void>();
    const { result } = renderHook(() => useFileDropZone(zoneRef, onDrop));

    fireDragEvent(target, 'dragenter', { types: ['Files'] });
    expect(result.current).toBe(true);

    const fileA = new File(['a'], 'a.txt', { type: 'text/plain' });
    const fileB = new File(['b'], 'b.txt', { type: 'text/plain' });
    fireDragEvent(target, 'drop', { files: [fileA, fileB] });

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith([fileA, fileB]);
    expect(result.current).toBe(false);
  });

  it('removes all drop-zone event listeners on unmount', () => {
    const { target, zoneRef } = setupZone();
    const addSpy = vi.spyOn(target, 'addEventListener');
    const removeSpy = vi.spyOn(target, 'removeEventListener');

    const { unmount } = renderHook(() => useFileDropZone(zoneRef, vi.fn()));

    const registered = new Map(addSpy.mock.calls.map(([type, listener]) => [type, listener]));
    expect([...registered.keys()].toSorted()).toEqual([
      'dragenter',
      'dragleave',
      'dragover',
      'drop',
    ]);

    unmount();

    registered.forEach((listener, type) => {
      expect(removeSpy).toHaveBeenCalledWith(type, listener);
    });
  });
});
