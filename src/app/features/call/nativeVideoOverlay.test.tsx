import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNativeVideoOverlay, type OverlayGeometry } from './nativeVideoOverlay';

vi.mock('@sableclient/tauri-plugin-livekit-mobile', () => ({
  setNativeCallRemoteVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  clearNativeCallRemoteVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  setNativeCallLocalVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  clearNativeCallLocalVideoOverlay: vi.fn<() => Promise<void>>(() => Promise.resolve()),
}));

const set = vi.fn<(callId: string, geometry: OverlayGeometry) => Promise<unknown>>(() =>
  Promise.resolve()
);
const clear = vi.fn<(callId: string) => Promise<unknown>>(() => Promise.resolve());

let slot: HTMLDivElement;
let rect: DOMRect;
const elementFromPoint = vi.fn<() => Element | null>();

const asRect = (x: number, y: number, width: number, height: number): DOMRect =>
  ({
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
  }) as DOMRect;

const onScreen = () => asRect(10, 20, 300, 200);

beforeEach(() => {
  set.mockClear();
  clear.mockClear();

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('devicePixelRatio', 2);

  rect = onScreen();
  slot = document.createElement('div');
  document.body.appendChild(slot);
  vi.spyOn(slot, 'getBoundingClientRect').mockImplementation(() => rect);
  elementFromPoint.mockReturnValue(slot);
  Object.defineProperty(document, 'elementFromPoint', {
    value: elementFromPoint,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const render = (active: boolean, node: HTMLDivElement | null = slot) =>
  renderHook(
    ({ isActive }: { isActive: boolean }) =>
      useNativeVideoOverlay('call-1', isActive, node, set, clear),
    { initialProps: { isActive: active } }
  );

describe('useNativeVideoOverlay', () => {
  it('reports the slot geometry once active', () => {
    render(true);

    expect(set).toHaveBeenCalledWith('call-1', {
      x: 10,
      y: 20,
      width: 300,
      height: 200,
      devicePixelRatio: 2,
    });
  });

  it('does not report while inactive', () => {
    render(false);

    expect(set).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith('call-1');
  });

  it('does not report without a slot node', () => {
    render(true, null);

    expect(set).not.toHaveBeenCalled();
  });

  it('reports again only when the geometry actually changes', () => {
    render(true);
    expect(set).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(set).toHaveBeenCalledTimes(1);

    rect = asRect(40, 20, 300, 200);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('clears rather than repainting at a stale position when the slot is occluded', () => {
    render(true);
    set.mockClear();
    clear.mockClear();

    const drawer = document.createElement('div');
    document.body.appendChild(drawer);
    elementFromPoint.mockReturnValue(drawer);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(clear).toHaveBeenCalledWith('call-1');
    expect(set).not.toHaveBeenCalled();
  });

  it('rechecks occlusion when a modal portal is added', async () => {
    render(true);
    clear.mockClear();
    const modal = document.createElement('div');
    elementFromPoint.mockReturnValue(modal);

    await act(async () => {
      document.body.appendChild(modal);
      await Promise.resolve();
    });

    expect(clear).toHaveBeenCalledWith('call-1');
  });

  it.each([
    ['collapsed', asRect(10, 20, 0, 0)],
    ['scrolled above the viewport', asRect(10, -400, 300, 200)],
    ['scrolled below the viewport', asRect(10, 900, 300, 200)],
    ['scrolled left of the viewport', asRect(-400, 20, 300, 200)],
    ['scrolled right of the viewport', asRect(1200, 20, 300, 200)],
  ])('clears when the slot is %s', (_label, offscreen) => {
    render(true);
    set.mockClear();
    clear.mockClear();

    rect = offscreen;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(clear).toHaveBeenCalledWith('call-1');
    expect(set).not.toHaveBeenCalled();
  });

  it('holds the overlay while the page is hidden, so PiP keeps the layer', () => {
    render(true);
    set.mockClear();
    clear.mockClear();

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    rect = asRect(10, 900, 300, 200);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(clear).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('tracks nested scroll containers, which do not bubble', () => {
    render(true);
    set.mockClear();

    rect = asRect(10, 60, 300, 200);
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });

    expect(set).toHaveBeenCalledTimes(1);
  });

  it('clears on unmount so a leftover overlay never outlives the surface', () => {
    const { unmount } = render(true);
    clear.mockClear();

    unmount();

    expect(clear).toHaveBeenCalledWith('call-1');
  });

  it('clears when it goes inactive mid-call, e.g. the camera is muted', () => {
    const { rerender } = render(true);
    clear.mockClear();

    rerender({ isActive: false });

    expect(clear).toHaveBeenCalledWith('call-1');
  });

  it('stops listening after unmount', () => {
    const { unmount } = render(true);
    unmount();
    set.mockClear();

    rect = asRect(500, 500, 300, 200);
    act(() => {
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new Event('scroll'));
    });

    expect(set).not.toHaveBeenCalled();
  });
});
