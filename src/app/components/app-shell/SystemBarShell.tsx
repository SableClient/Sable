import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';
import { setWindowBackgroundColor } from '$generated/tauri/commands';
import { updateThemeColorMeta } from '../../theme/themeColorMeta';

const safeAreaTop = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
const safeAreaBottom = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';
const iosBottomInset = `max(${safeAreaBottom}, var(--keyboard-height, 0px))`;
const safeAreaLeft = 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))';
const safeAreaRight = 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))';

const TRANSPARENT = /^(transparent$|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))/;
export const SYSTEM_BAR_REFRESH_EVENT = 'sable-system-bar-refresh';

// First non-transparent background color painted at (x, y).
function readSurfaceColor(x: number, y: number): string | undefined {
  let el = document.elementFromPoint(x, y);
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && !TRANSPARENT.test(bg)) return bg;
    el = el.parentElement;
  }
  return undefined;
}

// "rgb(r, g, b)" -> packed ARGB int for the native Android status bar.
function rgbToArgb(color: string): number | undefined {
  const parts = color.match(/\d+/g);
  if (!parts || parts.length < 3) return undefined;
  const [r, g, b] = parts.map((part) => parseInt(part, 10));
  if (r === undefined || g === undefined || b === undefined) return undefined;
  return ((0xff << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

// Color of the surface adjacent to a strip; on Android also tints the native system bar.
function useBarColor(
  probeRef: RefObject<HTMLDivElement | null>,
  edge: 'top' | 'bottom',
  android: boolean,
  enabled: boolean
): string | undefined {
  const [color, setColor] = useState<string>();
  const lastRef = useRef<string | undefined>(undefined);
  const lastWindowBackgroundRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return undefined;

    let frame = 0;
    let timer = 0;
    const sample = () => {
      frame = 0;
      const rect = probeRef.current?.getBoundingClientRect();
      const x = Math.round(rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
      const y =
        edge === 'top'
          ? Math.round((rect?.bottom ?? 0) + 1)
          : Math.round((rect?.top ?? window.innerHeight) - 1);
      const next = readSurfaceColor(x, y);
      if (next && next !== lastRef.current) {
        lastRef.current = next;
        setColor(next);
        if (edge === 'top') updateThemeColorMeta(next);
        if (android) {
          const argb = rgbToArgb(next);
          const command = edge === 'top' ? 'set_status_bar_color' : 'set_navigation_bar_color';
          if (argb !== undefined) {
            invoke(command, { color: argb }).catch(() => {});
          }
        }
      }

      // The Activity background is exposed while Android resizes the WebView for the IME.
      // Keep that fallback in sync with the app background, not a route-specific surface.
      if (android && edge === 'bottom') {
        const background = getComputedStyle(document.body).backgroundColor;
        if (background !== lastWindowBackgroundRef.current) {
          lastWindowBackgroundRef.current = background;
          const argb = rgbToArgb(background);
          if (argb !== undefined) setWindowBackgroundColor({ color: argb }).catch(() => {});
        }
      }
    };
    const runSample = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sample);
    };
    const schedule = () => {
      runSample();
      window.clearTimeout(timer);
      timer = window.setTimeout(runSample, 120);
    };

    runSample();
    const observer = new MutationObserver(schedule);
    // childList = navigation; class/style = theme swaps and per-view recolors.
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    observer.observe(document.head, { childList: true }); // remote-theme css
    window.addEventListener('resize', schedule);
    window.addEventListener(SYSTEM_BAR_REFRESH_EVENT, sample);

    return () => {
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener(SYSTEM_BAR_REFRESH_EVENT, sample);
    };
  }, [probeRef, edge, android, enabled]);

  return color;
}

type SystemBarStripProps = {
  edge: 'top' | 'bottom';
  size: string;
  background: string;
  stripRef?: RefObject<HTMLDivElement | null>;
  transition?: string;
};

function SystemBarStrip({ edge, size, background, stripRef, transition }: SystemBarStripProps) {
  return (
    <div
      ref={stripRef}
      aria-hidden="true"
      data-system-bar-position={edge}
      style={{
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
        transition,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background,
        }}
      />
    </div>
  );
}

type SystemBarShellProps = {
  children: ReactNode;
  onPortalContainerChange: (node: HTMLDivElement | null) => void;
};

export function SystemBarShell({ children, onPortalContainerChange }: SystemBarShellProps) {
  const tauriOs = isTauri() ? osType() : undefined;
  const enabled = tauriOs === 'android' || tauriOs === 'ios';

  const topStripRef = useRef<HTMLDivElement>(null);
  const bottomStripRef = useRef<HTMLDivElement>(null);
  const topColor = useBarColor(topStripRef, 'top', tauriOs === 'android', enabled);
  const bottomColor = useBarColor(bottomStripRef, 'bottom', tauriOs === 'android', enabled);

  return (
    <>
      <SystemBarStrip
        edge="top"
        size={safeAreaTop}
        background={topColor ?? 'var(--sable-bg-container)'}
        stripRef={topStripRef}
      />

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          minHeight: 0,
          flex: 1,
          paddingLeft: enabled ? safeAreaLeft : 0,
          paddingRight: enabled ? safeAreaRight : 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            minHeight: 0,
            flex: 1,
          }}
        >
          {children}
        </div>

        <div id="portalContainer" ref={onPortalContainerChange} />
      </div>

      {enabled && (
        <SystemBarStrip
          edge="bottom"
          size={tauriOs === 'ios' ? iosBottomInset : safeAreaBottom}
          background={bottomColor ?? 'var(--sable-surface-container)'}
          stripRef={bottomStripRef}
          transition={tauriOs === 'ios' ? 'height 0.25s ease-out' : undefined}
        />
      )}
    </>
  );
}
