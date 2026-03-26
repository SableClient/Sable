import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { focusedSettingTile } from './styles.css';

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
      activeTargetRef.current?.classList.remove(focusedSettingTile);
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
        if (activeTargetRef.current && activeTargetRef.current !== target) {
          activeTargetRef.current.classList.remove(focusedSettingTile);
        }
        if (timeoutRef.current !== undefined) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = undefined;
        }

        target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        target.classList.add(focusedSettingTile);
        activeTargetRef.current = target;

        timeoutRef.current = window.setTimeout(() => {
          target.classList.remove(focusedSettingTile);
          if (activeTargetRef.current === target) {
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
