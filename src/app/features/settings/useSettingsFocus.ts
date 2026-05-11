import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { focusedSettingTile } from './styles.css';

const focusedSettingTileClasses = focusedSettingTile.split(' ').filter(Boolean);
const getHighlightTarget = (target: HTMLElement): HTMLElement =>
  target.closest<HTMLElement>('[data-sequence-card="true"]') ?? target.parentElement ?? target;
const getFocusTarget = (focusId: string): HTMLElement | null =>
  document.getElementById(focusId) ??
  Array.from(document.querySelectorAll<HTMLElement>('[data-settings-focus]')).find(
    (element) => element.getAttribute('data-settings-focus') === focusId
  ) ??
  null;
const SETTINGS_FOCUS_HANDLED_STATE_KEY = 'settingsFocusHandledKey';

type SettingsFocusRouteState = {
  [SETTINGS_FOCUS_HANDLED_STATE_KEY]?: string;
};

export function useSettingsFocus() {
  const navigate = useNavigate();
  const location = useLocation();
  const focusId = new URLSearchParams(location.search).get('focus');
  const focusNavigationKey = focusId ? `${location.pathname}${location.search}` : undefined;
  const handledFocusNavigationKey = (location.state as SettingsFocusRouteState | null)?.[
    SETTINGS_FOCUS_HANDLED_STATE_KEY
  ];
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
    if (!focusId || !focusNavigationKey || handledFocusNavigationKey === focusNavigationKey) {
      return;
    }

    const target = getFocusTarget(focusId);

    if (!target) return;

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

    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state:
          location.state && typeof location.state === 'object'
            ? {
                ...(location.state as Record<string, unknown>),
                [SETTINGS_FOCUS_HANDLED_STATE_KEY]: focusNavigationKey,
              }
            : {
                [SETTINGS_FOCUS_HANDLED_STATE_KEY]: focusNavigationKey,
              },
      }
    );

    timeoutRef.current = window.setTimeout(() => {
      highlightTarget.classList.remove(...focusedSettingTileClasses);
      if (activeTargetRef.current === highlightTarget) {
        activeTargetRef.current = null;
      }
      timeoutRef.current = undefined;
    }, 3000);
  }, [
    focusId,
    focusNavigationKey,
    handledFocusNavigationKey,
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);
}
