import { type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { type as osType } from '@tauri-apps/plugin-os';

const safeAreaTop = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
const safeAreaBottom = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';
const safeAreaLeft = 'var(--safe-area-inset-left, env(safe-area-inset-left, 0px))';
const safeAreaRight = 'var(--safe-area-inset-right, env(safe-area-inset-right, 0px))';

type SystemBarStripProps = {
  position: 'top' | 'bottom';
  size: string;
};

function SystemBarStrip({ position, size }: SystemBarStripProps) {
  return (
    <div
      style={{
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--sable-bg-container)',
          ...(position === 'top'
            ? { borderBottom: '1px solid var(--sable-bg-container-line)' }
            : { borderTop: '1px solid var(--sable-bg-container-line)' }),
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

  return (
    <>
      {enabled && <SystemBarStrip position="top" size={safeAreaTop} />}

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

      {enabled && <SystemBarStrip position="bottom" size={safeAreaBottom} />}
    </>
  );
}
