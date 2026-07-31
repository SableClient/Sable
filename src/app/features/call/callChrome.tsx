import type { CSSProperties, FocusEventHandler, PointerEventHandler, ReactNode } from 'react';
import { Box, Button, color, Text } from 'folds';
import {
  Microphone,
  MicrophoneSlash,
  VideoCamera,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import type { CallClient, CallStatusView } from './callClient';
import * as css from './callChrome.css';

/**
 * The full-height dark canvas both call surfaces render into. The livekit-js
 * surface layers absolutely-positioned tiles over it and marks it for
 * automation (`callSurfaceMarker`) with pointer handlers that drive control
 * auto-hide; the native surface stacks its status row, tile grid, and control
 * bar in normal flow (`stack`), because native video overlays occlude anything
 * beneath them.
 */
export type CallLayoutProps = {
  children: ReactNode;
  stack?: boolean;
  callSurfaceMarker?: boolean;
  className?: string;
  style?: CSSProperties;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
};

export function CallLayout({
  children,
  stack,
  callSurfaceMarker,
  className,
  style,
  onPointerMove,
  onPointerDown,
  onFocusCapture,
}: CallLayoutProps) {
  const mergedClassName = [css.callLayout, className].filter(Boolean).join(' ') || undefined;
  return (
    <Box
      className={mergedClassName}
      direction={stack ? 'Column' : undefined}
      role="region"
      aria-label="Call"
      data-livekit-call-surface={callSurfaceMarker ? true : undefined}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onFocusCapture={onFocusCapture}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      {children}
    </Box>
  );
}

/**
 * The control bar shell. `overlay` floats over the canvas and auto-hides
 * (livekit-js: `visible` drives opacity/visibility, the pill re-enables
 * hit-testing); `flow` sits in normal layout below the tiles and is always
 * visible (native). The actual controls are passed as children — the two
 * engines render different buttons (livekit-js uses its component-library
 * `ControlBar` with device menus; native uses the shared `CallMediaControls`
 * toggles) — so only the shell is shared.
 */
export type CallControlBarProps = {
  children: ReactNode;
  layout?: 'overlay' | 'flow';
  visible?: boolean;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
};

export function CallControlBar({
  children,
  layout = 'flow',
  visible,
  onFocusCapture,
}: CallControlBarProps) {
  if (layout === 'overlay') {
    return (
      <Box
        data-livekit-controls
        role="group"
        aria-label="Call controls"
        className={css.controlBarOverlay}
        onFocusCapture={onFocusCapture}
        style={
          visible !== undefined
            ? { opacity: visible ? 1 : 0, visibility: visible ? 'visible' : 'hidden' }
            : undefined
        }
      >
        <div
          className={css.controlPill}
          style={visible !== undefined ? { pointerEvents: visible ? 'auto' : 'none' } : undefined}
        >
          {children}
        </div>
      </Box>
    );
  }

  return (
    <Box className={css.controlBarFlow} role="group" aria-label="Call controls">
      <div className={css.controlPill}>{children}</div>
    </Box>
  );
}

/**
 * Full-screen status display: lifecycle label, optional error detail, and an
 * End / Dismiss button. Used by the livekit-js surface for every non-active
 * lifecycle (it has no room to render until `active`) and by the native surface
 * for its terminal error state. Both feed a `CallStatusView` produced by their
 * engine's status adapter, so the chrome and label maps stay shared.
 */
export function CallStatusBar({
  status,
  onHangup,
}: {
  status: CallStatusView;
  onHangup: () => void;
}) {
  const failed = status.phase === 'failed';
  return (
    <Box alignItems="Center" justifyContent="Center" direction="Column" gap="300" grow="Yes">
      <Box direction="Column" gap="100" alignItems="Center">
        <Text size="L400">{status.statusLabel}</Text>
        {status.error && (
          <Text style={{ color: color.Critical.Main }} size="T300" align="Center">
            {status.error}
          </Text>
        )}
      </Box>
      <Button size="300" variant="Critical" fill="Soft" radii="300" onClick={onHangup}>
        <Text as="span" size="B300">
          {failed ? 'Dismiss' : 'End'}
        </Text>
      </Button>
    </Box>
  );
}

/**
 * Round on/off toggle button for mic and camera. `data-on` / `aria-pressed`
 * carry the on (neutral) vs off (muted-red) state. Extracted from the native
 * surface so the affordance is owned by the shared chrome.
 */
export type CallMediaToggleButtonProps = {
  on: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
  onToggle: () => void;
};

export function CallMediaToggleButton({
  on,
  disabled,
  label,
  children,
  onToggle,
}: CallMediaToggleButtonProps) {
  return (
    <button
      type="button"
      className={css.controlButton}
      data-on={on}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}

/**
 * Mic + camera toggles built from `CallMediaToggleButton`. Engines that expose
 * direct media toggles (the native engine) render this inside their control
 * bar; the livekit-js engine delegates to its component-library `ControlBar`
 * instead, so it does not use this.
 *
 * The props are the media slice of `CallClient`, required — the native session
 * always provides them.
 */
export type CallMediaControlsProps = Required<
  Pick<
    CallClient,
    'microphoneEnabled' | 'cameraEnabled' | 'setMicrophoneEnabled' | 'setCameraEnabled'
  >
> & {
  disabled?: boolean;
};

export function CallMediaControls({
  microphoneEnabled,
  cameraEnabled,
  setMicrophoneEnabled,
  setCameraEnabled,
  disabled,
}: CallMediaControlsProps) {
  return (
    <>
      <CallMediaToggleButton
        on={microphoneEnabled}
        disabled={disabled}
        label={microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        onToggle={() => void setMicrophoneEnabled(!microphoneEnabled)}
      >
        {sizedIcon(microphoneEnabled ? Microphone : MicrophoneSlash, '300', {
          filled: !microphoneEnabled,
        })}
      </CallMediaToggleButton>
      <CallMediaToggleButton
        on={cameraEnabled}
        disabled={disabled}
        label={cameraEnabled ? 'Stop camera' : 'Start camera'}
        onToggle={() => void setCameraEnabled(!cameraEnabled)}
      >
        {sizedIcon(cameraEnabled ? VideoCamera : VideoCameraSlash, '300', {
          filled: cameraEnabled,
        })}
      </CallMediaToggleButton>
    </>
  );
}
