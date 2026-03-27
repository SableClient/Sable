import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { focusedSettingTile } from './styles.css';

const focusedSettingTileClasses = focusedSettingTile.split(' ').filter(Boolean);
const getHighlightTarget = (target: HTMLElement): HTMLElement =>
  target.closest<HTMLElement>('[data-sequence-card="true"]') ?? target.parentElement ?? target;

export function useSettingsFocus() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = undefined;
      }
      activeTargetRef.current?.classList.remove(...focusedSettingTileClasses);
      activeTargetRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (focusId) {
      const target =
        document.getElementById(focusId) ??
        document.querySelector<HTMLElement>(`[data-settings-focus="${focusId}"]`);

      if (target) {
        const highlightTarget = getHighlightTarget(target);

        if (activeTargetRef.current && activeTargetRef.current !== highlightTarget) {
          activeTargetRef.current.classList.remove(...focusedSettingTileClasses);
        }
        if (timeoutRef.current !== undefined) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = undefined;
        }

        target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        highlightTarget.classList.add(...focusedSettingTileClasses);
        activeTargetRef.current = highlightTarget;

        timeoutRef.current = window.setTimeout(() => {
          highlightTarget.classList.remove(...focusedSettingTileClasses);
          if (activeTargetRef.current === highlightTarget) {
            activeTargetRef.current = null;
          }
          timeoutRef.current = undefined;

          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('focus');
              return next;
            },
            { replace: true }
          );
        }, 3000);
      }
    }
  }, [focusId, searchParams, setSearchParams]);
}
