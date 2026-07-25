import classNames from 'classnames';
import { Box, config, Text } from 'folds';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { type TitlebarStatusView } from '$state/titlebarStatus';
import { ContainerColor } from '$styles/ContainerColor.css';

const TITLEBAR_EASE_OUT: [number, number, number, number] = [0.32, 0.72, 0, 1];
const TITLEBAR_EASE_OUT_SOFT: [number, number, number, number] = [0.24, 0.72, 0.08, 1];

type SyncConnectionStatusProps = {
  status: TitlebarStatusView | null;
};

export function SyncConnectionStatusBanner({ status }: SyncConnectionStatusProps) {
  const shouldReduceMotion = useReducedMotion();

  const bannerVariants: Variants = shouldReduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
      }
    : {
        hidden: { y: -30, opacity: 0, scale: 0.95 },
        visible: {
          y: 0,
          opacity: 1,
          scale: 1,
          transition: { type: 'spring', damping: 20, stiffness: 300 },
        },
        exit: {
          y: -20,
          opacity: 0,
          scale: 0.95,
          transition: { duration: 0.15, ease: TITLEBAR_EASE_OUT },
        },
      };

  return (
    <Box
      style={{
        position: 'fixed',
        top: `calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + ${config.space.S300})`,
        left: 0,
        right: 0,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
      alignItems="Center"
      justifyContent="Center"
    >
      <AnimatePresence mode="wait">
        {status && (
          <motion.div
            key={status.variant}
            variants={bannerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              willChange: shouldReduceMotion ? 'opacity' : 'transform, opacity',
              borderRadius: '9999px',
              overflow: 'hidden',
              backdropFilter: 'blur(64px) saturate(160%)',
              WebkitBackdropFilter: 'blur(64px) saturate(160%)',
              backgroundColor: `color-mix(in srgb, ${
                status.variant === 'Primary'
                  ? 'var(--sable-primary-main)'
                  : status.variant === 'Success'
                    ? 'var(--sable-success-main)'
                    : status.variant === 'Warning'
                      ? 'var(--sable-warn-main)'
                      : status.variant === 'Critical'
                        ? 'var(--sable-crit-main)'
                        : 'currentColor'
              } 32%, transparent)`,
            }}
          >
            <Box
              className={ContainerColor({ variant: status.variant })}
              style={{
                padding: `${config.space.S100} ${config.space.S400}`,
                borderRadius: '9999px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                border: `1px solid color-mix(in srgb, ${
                  status.variant === 'Primary'
                    ? 'var(--sable-primary-main)'
                    : status.variant === 'Success'
                      ? 'var(--sable-success-main)'
                      : status.variant === 'Warning'
                        ? 'var(--sable-warn-main)'
                        : status.variant === 'Critical'
                          ? 'var(--sable-crit-main)'
                          : 'currentColor'
                } 30%, transparent)`,
                backgroundColor: 'transparent',
                position: 'relative',
                overflow: 'hidden',
              }}
              alignItems="Center"
              justifyContent="Center"
            >
              <Text size="L400">{status.text}</Text>

              {status.progress !== undefined && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: '2px',
                    backgroundColor:
                      status.variant === 'Primary'
                        ? 'var(--sable-primary-main)'
                        : status.variant === 'Success'
                          ? 'var(--sable-success-main)'
                          : status.variant === 'Warning'
                            ? 'var(--sable-warn-main)'
                            : status.variant === 'Critical'
                              ? 'var(--sable-crit-main)'
                              : 'currentColor',
                    width: `${status.progress}%`,
                    transition: 'width 0.3s ease-out',
                  }}
                />
              )}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

export function SyncConnectionStatusTitlebar({ status }: SyncConnectionStatusProps) {
  const shouldReduceMotion = useReducedMotion();
  const progress = status?.progress;
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
          key={status.variant}
          className={classNames(
            'tauri-titlebar-status__label',
            status.variant === 'Success' && 'tauri-titlebar-status__label--success',
            status.variant === 'Warning' && 'tauri-titlebar-status__label--warning',
            status.variant === 'Critical' && 'tauri-titlebar-status__label--critical',
            status.variant === 'Primary' && 'tauri-titlebar-status__label--primary'
          )}
          style={{
            transformOrigin: 'center top',
            position: 'relative',
            overflow: 'hidden',
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
          {progress !== undefined && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '2px',
                backgroundColor:
                  status.variant === 'Primary'
                    ? 'var(--sable-primary-main)'
                    : status.variant === 'Success'
                      ? 'var(--sable-success-main)'
                      : status.variant === 'Warning'
                        ? 'var(--sable-warn-main)'
                        : status.variant === 'Critical'
                          ? 'var(--sable-crit-main)'
                          : 'currentColor',
                width: `${progress}%`,
                transition: 'width 0.3s ease-out',
              }}
            />
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
