import { useEffect, useRef } from 'react';
import { useActiveIndicator } from './ActiveIndicatorContext';
import * as css from './ActiveIndicator.css';

export function ActiveIndicator() {
  const ctx = useActiveIndicator();
  const ref = useRef<HTMLDivElement>(null);
  const restoreTransitionRef = useRef<number | null>(null);
  const scrollingRef = useRef(false);

  useEffect(() => {
    if (!ctx) return undefined;
    const indicator = ref.current;
    if (!indicator) return undefined;
    const sidebar = indicator.parentElement;
    if (!sidebar) return undefined;
    const scrollables = sidebar.querySelectorAll<HTMLElement>('[data-sidebar-scroll-area]');

    const isVisibleWithinAncestors = (active: HTMLElement) => {
      const activeRect = active.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();

      if (activeRect.bottom <= sidebarRect.top || activeRect.top >= sidebarRect.bottom) {
        return false;
      }

      return Array.from(scrollables).every((el) => {
        if (!el.contains(active)) return true;

        const rect = el.getBoundingClientRect();
        return activeRect.bottom > rect.top && activeRect.top < rect.bottom;
      });
    };

    const update = (animate = true) => {
      const active = ctx.getActiveElement();
      if (!active) {
        indicator.style.opacity = '0';
        return;
      }
      if (!isVisibleWithinAncestors(active)) {
        indicator.style.opacity = '0';
        return;
      }

      if (!animate || scrollingRef.current) {
        indicator.style.transition = 'none';
      } else {
        indicator.style.removeProperty('transition');
      }

      const sidebarRect = sidebar.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const top =
        activeRect.top - sidebarRect.top + activeRect.height / 2 - indicator.offsetHeight / 2;
      indicator.style.opacity = '1';
      indicator.style.top = `${top}px`;
    };

    const unsubscribe = ctx.subscribe(() => update(true));
    update();

    // Track scroll within the sidebar
    const handleScroll = () => {
      scrollingRef.current = true;
      if (restoreTransitionRef.current !== null) {
        clearTimeout(restoreTransitionRef.current);
      }
      update(false);
      restoreTransitionRef.current = window.setTimeout(() => {
        scrollingRef.current = false;
        indicator.style.removeProperty('transition');
        restoreTransitionRef.current = null;
      }, 80);
    };
    scrollables.forEach((el) => el.addEventListener('scroll', handleScroll, { passive: true }));
    window.addEventListener('resize', update, { passive: true });

    return () => {
      unsubscribe();
      if (restoreTransitionRef.current !== null) {
        clearTimeout(restoreTransitionRef.current);
      }
      scrollables.forEach((el) => el.removeEventListener('scroll', handleScroll));
      window.removeEventListener('resize', update);
    };
  }, [ctx]);

  return <div ref={ref} className={css.ActiveIndicator} />;
}
