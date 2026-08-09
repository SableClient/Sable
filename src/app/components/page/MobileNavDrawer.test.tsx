import { useLayoutEffect, useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MobileNavDrawer } from './MobileNavDrawer';
import { useMobileNavDrawer } from './MobileNavDrawerContext';

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [true, vi.fn<() => void>()],
}));

vi.mock('./PersistentRoomHost', () => ({
  PersistentRoomHost: () => <div data-testid="persistent-room-host" />,
}));

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ??
    ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
});

const renderDrawer = () =>
  render(
    <MemoryRouter initialEntries={['/home']}>
      <MobileNavDrawer nav={<div>nav</div>}>
        <div>content</div>
      </MobileNavDrawer>
    </MemoryRouter>
  );

const touchList = (target: HTMLElement, clientX: number, clientY: number) => {
  const point = { identifier: 0, target, clientX, clientY, pageX: clientX, pageY: clientY };
  return { touches: [point], targetTouches: [point], changedTouches: [point] };
};

describe('MobileNavDrawer', () => {
  // The panels sit side by side in a track twice the viewport wide, moved by transform.
  // `hidden` leaves a scrollport that focus or scrollIntoView scrolls a full panel width,
  // stacking on top of the transform and stranding the active panel off frame.
  it('clips the viewport instead of hiding overflow, so it can never be scrolled', () => {
    renderDrawer();

    const viewport = screen.getByTestId('mobile-nav-drawer-viewport');

    expect(viewport.style.overflow).toBe('clip');
    expect(viewport.style.overflow).not.toBe('hidden');
  });

  it('still drives message swipe when the gesture starts on a nested ignored element (e.g. an image)', () => {
    const move = vi.fn<(distanceX: number) => void>();

    function MessageProbe() {
      const drawer = useMobileNavDrawer();
      const containerRef = useRef<HTMLDivElement | null>(null);
      useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el || !drawer) return undefined;
        return drawer.registerMessageSwipe(el, {
          move,
          end: vi.fn<(gesture: { distanceX: number; velocityX: number }) => void>(),
          cancel: vi.fn<() => void>(),
        });
      }, [drawer]);
      return (
        <div ref={containerRef} data-message-swipe data-gestures="ignore">
          <div data-gestures="ignore" data-testid="image">
            image
          </div>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/home']}>
        <MobileNavDrawer nav={<MessageProbe />}>
          <div>content</div>
        </MobileNavDrawer>
      </MemoryRouter>
    );

    const image = screen.getByTestId('image');
    fireEvent.touchStart(image, touchList(image, 260, 100));
    fireEvent.touchMove(image, touchList(image, 200, 100));

    expect(move).toHaveBeenCalled();
  });
});
