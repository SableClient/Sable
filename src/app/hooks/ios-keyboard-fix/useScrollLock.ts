// Vendored from https://github.com/Crscristi28/ios-pwa-keyboard-fix (MIT)
// Replace this import path with 'ios-pwa-keyboard-fix' once published to npm.
import { useEffect } from 'react';

// Conditional scroll-lock safety net for the input bar.
// While the keyboard is open, Safari can still trigger a document scroll
// when the keyboard mode switches (text ↔ emoji), because there is no
// onMouseDown moment for us to pre-lift on. This listener detects the
// document moving away from scrollY: 0 and snaps it back, so the input
// bar does not drift with the page.
// Outside of this state the page scrolls normally.
//
// Important: this hook assumes the layout where window.scrollY stays at 0
// because the page itself does not scroll — content scrolls inside <main>
// with overflow-y:auto, while html/body/#root use overflow:hidden. See
// README "Layout structure" and docs/ARCHITECTURE.md. Without that layout,
// this lock will fight legitimate page scroll while the keyboard is open.
export function useScrollLock(active: boolean) {
  useEffect(() => {
    const preventScroll = () => {
      if (active && window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('scroll', preventScroll);
    return () => {
      window.removeEventListener('scroll', preventScroll);
    };
  }, [active]);
}
