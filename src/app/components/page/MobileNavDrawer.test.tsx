import { useLayoutEffect, useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router';
import { MobileNavDrawer } from './MobileNavDrawer';
import { useMobileNavDrawer } from './MobileNavDrawerContext';

vi.mock('$state/hooks/settings', () => ({
  useSetting: () => [true, vi.fn<() => void>()],
}));

vi.mock('./PersistentRoomHost', () => ({
  PersistentRoomHost: () => (
    <div data-testid="persistent-room-host">
      <input aria-label="composer" />
    </div>
  ),
}));

let reduceMotion = false;

afterEach(() => {
  reduceMotion = false;
  vi.restoreAllMocks();
});

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion') ? reduceMotion : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
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

function ChatSwipeProbe({
  scrollerWidth,
  contentsWidth,
  move,
}: {
  scrollerWidth: number;
  contentsWidth: number;
  move: (distanceX: number) => void;
}) {
  const drawer = useMobileNavDrawer();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !drawer) return undefined;
    return drawer.registerChatSwipe(el, {
      move,
      end: vi.fn<(gesture: { distanceX: number; velocityX: number }) => void>(),
      cancel: vi.fn<() => void>(),
    });
  }, [drawer, move]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    vi.spyOn(el, 'clientWidth', 'get').mockReturnValue(scrollerWidth);
    vi.spyOn(el, 'scrollWidth', 'get').mockReturnValue(contentsWidth);
  }, [scrollerWidth, contentsWidth]);
  return (
    <div ref={containerRef} data-chat-swipe data-gestures="ignore">
      <div ref={scrollRef} data-gestures="scroll">
        <div data-testid="scrollContents">hi</div>
      </div>
    </div>
  );
}

function BackToListHarness() {
  const navigate = useNavigate();
  return (
    <MobileNavDrawer
      nav={
        <button type="button" onClick={() => navigate('/home')}>
          back to list
        </button>
      }
    >
      <div>content</div>
    </MobileNavDrawer>
  );
}

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

  it('drops focus from the panel that slides out of view', () => {
    reduceMotion = true;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);

    render(
      <MemoryRouter initialEntries={['/home/!room:example.org']}>
        <BackToListHarness />
      </MemoryRouter>
    );

    const composer = screen.getByLabelText('composer');
    composer.focus();
    expect(document.activeElement).toBe(composer);

    fireEvent.click(screen.getByRole('button', { name: 'back to list' }));

    expect(document.activeElement).not.toBe(composer);
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

  describe('Scroll swipe gesture', () => {
    it('should call chat swipe when swiping on a non-scrollable scrolling element', () => {
      const move = vi.fn<(distanceX: number) => void>();

      render(
        <MemoryRouter initialEntries={['/home']}>
          <MobileNavDrawer
            nav={<ChatSwipeProbe scrollerWidth={100} contentsWidth={50} move={move} />}
          >
            <div>content</div>
          </MobileNavDrawer>
        </MemoryRouter>
      );

      const image = screen.getByTestId('scrollContents');
      fireEvent.touchStart(image, touchList(image, 260, 100));
      fireEvent.touchMove(image, touchList(image, 200, 100));

      expect(move).toHaveBeenCalled();
    });

    it('should not call chat swipe when swiping on a scrollable scrolling element', () => {
      const move = vi.fn<(distanceX: number) => void>();

      render(
        <MemoryRouter initialEntries={['/home']}>
          <MobileNavDrawer
            nav={<ChatSwipeProbe scrollerWidth={100} contentsWidth={150} move={move} />}
          >
            <div>content</div>
          </MobileNavDrawer>
        </MemoryRouter>
      );

      const image = screen.getByTestId('scrollContents');
      fireEvent.touchStart(image, touchList(image, 260, 100));
      fireEvent.touchMove(image, touchList(image, 200, 100));

      expect(move).not.toHaveBeenCalled();
    });
  });
});
