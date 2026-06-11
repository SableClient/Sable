import classNames from 'classnames';
import { Box, config, Line, Text } from 'folds';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SyncState } from '$types/matrix-sdk';
import { type TitlebarStatusView } from '$state/titlebarStatus';
import { ContainerColor } from '$styles/ContainerColor.css';

const TITLEBAR_EASE_OUT: [number, number, number, number] = [0.32, 0.72, 0, 1];
const TITLEBAR_EASE_OUT_SOFT: [number, number, number, number] = [0.24, 0.72, 0.08, 1];

type SyncConnectionStatusProps = {
  status: TitlebarStatusView | null;
};

export function getSyncConnectionStatusView(
  current: SyncState | null,
  previous: SyncState | null | undefined
): TitlebarStatusView | null {
  if (
    (current === SyncState.Prepared ||
      current === SyncState.Syncing ||
      current === SyncState.Catchup) &&
    previous !== SyncState.Syncing
  ) {
    return { text: 'Connecting...', variant: 'Success' };
  }

  if (current === SyncState.Reconnecting) {
    return { text: 'Connection Lost! Reconnecting...', variant: 'Warning' };
  }

  if (current === SyncState.Error) {
    return { text: 'Connection Lost!', variant: 'Critical' };
  }

  return null;
}

export function SyncConnectionStatusBanner({ status }: SyncConnectionStatusProps) {
  if (!status) return null;

  return (
    <Box direction="Column" shrink="No">
      <Box
        className={ContainerColor({ variant: status.variant })}
        style={{ padding: `${config.space.S100} 0` }}
        alignItems="Center"
        justifyContent="Center"
      >
        <Text size="L400">{status.text}</Text>
      </Box>
      <Line variant={status.variant} size="300" />
    </Box>
  );
}

export function SyncConnectionStatusTitlebar({ status }: SyncConnectionStatusProps) {
  const shouldReduceMotion = useReducedMotion();
  const pillVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { duration: 0.18, ease: TITLEBAR_EASE_OUT },
        },
        exit: {
          opacity: 0,
          transition: {
            when: 'afterChildren' as const,
            opacity: { duration: 0.1, delay: 0.08, ease: TITLEBAR_EASE_OUT_SOFT },
          },
        },
      }
    : {
        hidden: {
          y: -2,
          scaleX: 0.98,
          scaleY: 0.96,
          opacity: 0,
          clipPath: 'inset(0 50% 0 50% round 999px)',
        },
        visible: {
          y: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          clipPath: 'inset(0 0% 0 0% round 999px)',
          transition: { duration: 0.2, ease: TITLEBAR_EASE_OUT },
        },
        exit: {
          y: -2,
          scaleX: 0.98,
          scaleY: 0.96,
          opacity: 0,
          clipPath: 'inset(0 50% 0 50% round 999px)',
          transition: {
            when: 'afterChildren' as const,
            y: { duration: 0.2, ease: TITLEBAR_EASE_OUT },
            scaleX: { duration: 0.2, ease: TITLEBAR_EASE_OUT },
            scaleY: { duration: 0.2, ease: TITLEBAR_EASE_OUT },
            clipPath: { duration: 0.2, ease: TITLEBAR_EASE_OUT },
            opacity: { duration: 0.1, delay: 0.08, ease: TITLEBAR_EASE_OUT_SOFT },
          },
        },
      };

  const textVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { duration: 0.12, ease: TITLEBAR_EASE_OUT },
        },
        exit: {
          opacity: 0,
          transition: { duration: 0.1, ease: TITLEBAR_EASE_OUT_SOFT },
        },
      }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { duration: 0.12, delay: 0.04, ease: TITLEBAR_EASE_OUT_SOFT },
        },
        exit: {
          opacity: 0,
          transition: { duration: 0.1, ease: TITLEBAR_EASE_OUT_SOFT },
        },
      };

  return (
    <AnimatePresence mode="sync" initial={false}>
      {status && (
        <motion.span
          key={`${status.variant}-${status.text}`}
          className={classNames(
            'tauri-titlebar-status__label',
            status.variant === 'Success' && 'tauri-titlebar-status__label--success',
            status.variant === 'Warning' && 'tauri-titlebar-status__label--warning',
            status.variant === 'Critical' && 'tauri-titlebar-status__label--critical'
          )}
          style={{
            transformOrigin: 'center top',
            willChange: shouldReduceMotion ? 'opacity' : 'transform, opacity, clip-path',
          }}
          variants={pillVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.span
            className="tauri-titlebar-status__text"
            style={{ willChange: 'opacity' }}
            variants={textVariants}
          >
            {status.text}
          </motion.span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
