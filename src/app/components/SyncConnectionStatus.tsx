import React from 'react';
import classNames from 'classnames';
import { Box, config, Text } from 'folds';
import { useNativePresence } from '$hooks/useNativePresence';
import { type TitlebarStatusView } from '$state/titlebarStatus';
import { ContainerColor } from '$styles/ContainerColor.css';
import * as css from './SyncConnectionStatus.css';

type SyncConnectionStatusProps = {
  status: TitlebarStatusView | null;
  onClick?: () => void;
  icon?: React.ReactNode;
};

export function SyncConnectionStatusBanner({ status }: SyncConnectionStatusProps) {
  const { displayed: renderedStatus, phase } = useNativePresence(status, status?.variant, 150);

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
      {renderedStatus && (
        <div
          key={renderedStatus.variant}
          className={phase === 'exit' ? css.BannerExit : css.BannerEnter}
          style={{
            borderRadius: '9999px',
            overflow: 'hidden',
            backdropFilter: 'blur(64px) saturate(160%)',
            WebkitBackdropFilter: 'blur(64px) saturate(160%)',
            backgroundColor: `color-mix(in srgb, ${
              renderedStatus.variant === 'Primary'
                ? 'var(--sable-primary-main)'
                : renderedStatus.variant === 'Success'
                  ? 'var(--sable-success-main)'
                  : renderedStatus.variant === 'Warning'
                    ? 'var(--sable-warn-main)'
                    : renderedStatus.variant === 'Critical'
                      ? 'var(--sable-crit-main)'
                      : 'currentColor'
            } 32%, transparent)`,
          }}
        >
          <Box
            className={ContainerColor({ variant: renderedStatus.variant })}
            style={{
              padding: `${config.space.S100} ${config.space.S400}`,
              borderRadius: '9999px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
              border: `1px solid color-mix(in srgb, ${
                renderedStatus.variant === 'Primary'
                  ? 'var(--sable-primary-main)'
                  : renderedStatus.variant === 'Success'
                    ? 'var(--sable-success-main)'
                    : renderedStatus.variant === 'Warning'
                      ? 'var(--sable-warn-main)'
                      : renderedStatus.variant === 'Critical'
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
            <Text size="L400">{renderedStatus.text}</Text>

            {renderedStatus.progress !== undefined && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  height: '2px',
                  backgroundColor:
                    renderedStatus.variant === 'Primary'
                      ? 'var(--sable-primary-main)'
                      : renderedStatus.variant === 'Success'
                        ? 'var(--sable-success-main)'
                        : renderedStatus.variant === 'Warning'
                          ? 'var(--sable-warn-main)'
                          : renderedStatus.variant === 'Critical'
                            ? 'var(--sable-crit-main)'
                            : 'currentColor',
                  width: `${renderedStatus.progress}%`,
                  transition: 'width 0.3s ease-out',
                }}
              />
            )}
          </Box>
        </div>
      )}
    </Box>
  );
}

export function SyncConnectionStatusTitlebar({ status, onClick, icon }: SyncConnectionStatusProps) {
  const { displayed: renderedStatus, phase } = useNativePresence(status, status?.variant, 200);
  const progress = renderedStatus?.progress;
  const interactiveProps = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (event: React.KeyboardEvent<HTMLSpanElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        },
      }
    : {};

  return (
    <>
      {renderedStatus && (
        <span
          key={renderedStatus.variant}
          {...interactiveProps}
          className={classNames(
            'tauri-titlebar-status__label',
            renderedStatus.variant === 'Success' && 'tauri-titlebar-status__label--success',
            renderedStatus.variant === 'Warning' && 'tauri-titlebar-status__label--warning',
            renderedStatus.variant === 'Critical' && 'tauri-titlebar-status__label--critical',
            renderedStatus.variant === 'Primary' && 'tauri-titlebar-status__label--primary',
            phase === 'exit' ? css.TitlebarPillExit : css.TitlebarPillEnter
          )}
          style={{
            transformOrigin: 'center top',
            position: 'relative',
            overflow: 'hidden',
            cursor: onClick ? 'pointer' : undefined,
          }}
        >
          <span
            className={phase === 'exit' ? css.TitlebarTextExit : css.TitlebarTextEnter}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {icon && (
              <span style={{ display: 'flex' }} aria-hidden>
                {icon}
              </span>
            )}
            <span className="tauri-titlebar-status__text">{renderedStatus.text}</span>
          </span>
          {progress !== undefined && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '2px',
                backgroundColor:
                  renderedStatus.variant === 'Primary'
                    ? 'var(--sable-primary-main)'
                    : renderedStatus.variant === 'Success'
                      ? 'var(--sable-success-main)'
                      : renderedStatus.variant === 'Warning'
                        ? 'var(--sable-warn-main)'
                        : renderedStatus.variant === 'Critical'
                          ? 'var(--sable-crit-main)'
                          : 'currentColor',
                width: `${progress}%`,
                transition: 'width 0.3s ease-out',
              }}
            />
          )}
        </span>
      )}
    </>
  );
}
