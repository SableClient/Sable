import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEventHandler,
  PointerEventHandler,
  ReactNode,
} from 'react';
import { Box, Button, color, Text } from 'folds';
import {
  Microphone,
  MicrophoneSlash,
  VideoCamera,
  VideoCameraSlash,
  sizedIcon,
} from '$components/icons/phosphor';
import type { CallStatusView } from './callClient';
import * as css from './callChrome.css';

/** Shared layout for web and native call surfaces. */
export type CallLayoutProps = {
  children: ReactNode;
  stack?: boolean;
  callSurfaceMarker?: boolean;
  className?: string;
  style?: CSSProperties;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
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
  onKeyDown,
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
      onKeyDown={onKeyDown}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      {children}
    </Box>
  );
}

/** Shared shell for the web overlay and native in-flow controls. */
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

/** Status display for call setup and failures. */
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

/** Shared mic and camera toggle. */
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

/** Native mic and camera controls. */
export type CallMediaControlsProps = {
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  cameraAvailable?: boolean;
  disabled?: boolean;
};

export function CallMediaControls({
  microphoneEnabled,
  cameraEnabled,
  setMicrophoneEnabled,
  setCameraEnabled,
  cameraAvailable = true,
  disabled,
}: CallMediaControlsProps) {
  return (
    <>
      {cameraAvailable && (
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
      )}
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
