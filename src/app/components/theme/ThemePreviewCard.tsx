import { type ReactNode, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Icon,
  IconButton,
  Icons,
  Text,
  Tooltip,
  TooltipProvider,
  toRem,
  config,
} from 'folds';

import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { copyToClipboard } from '$utils/dom';
import { buildPreviewStyleBlock, extractSafePreviewCustomProperties } from '../../theme/previewCss';

export type ThemePreviewCardProps = {
  title: string;
  subtitle?: ReactNode;
  beforePreview?: ReactNode;
  previewCssText: string;
  scopeSlug: string;
  copyText?: string;
  isFavorited?: boolean;
  onToggleFavorite?: () => void | Promise<void>;

  systemTheme: boolean;
  onApplyLight?: () => void | Promise<void>;
  onApplyDark?: () => void | Promise<void>;
  onApplyManual?: () => void | Promise<void>;
  isAppliedLight?: boolean;
  isAppliedDark?: boolean;
  isAppliedManual?: boolean;

  onRevert?: () => void;
  canRevert?: boolean;
  thirdParty?: boolean;

  onExport?: () => void;
};

function safeSlug(input: string): string {
  return (input || 'theme').replace(/[^a-zA-Z0-9_-]/g, '-') || 'theme';
}

export function ThemePreviewCard({
  title,
  subtitle,
  beforePreview,
  previewCssText,
  scopeSlug,
  copyText,
  isFavorited,
  onToggleFavorite,
  systemTheme,
  onApplyLight,
  onApplyDark,
  onApplyManual,
  isAppliedLight,
  isAppliedDark,
  isAppliedManual,
  onRevert,
  canRevert,
  thirdParty,
  onExport,
}: ThemePreviewCardProps) {
  const [copied, setCopied] = useTimeoutToggle();

  const scopeClass = useMemo(() => `sable-theme-preview--${safeSlug(scopeSlug)}`, [scopeSlug]);

  const styleBlock = useMemo(() => {
    const vars = extractSafePreviewCustomProperties(previewCssText);
    return buildPreviewStyleBlock(vars, scopeClass);
  }, [previewCssText, scopeClass]);

  const handleCopy = useCallback(async () => {
    if (!copyText) return;
    if (await copyToClipboard(copyText)) setCopied();
  }, [copyText, setCopied]);

  return (
    <Box
      direction="Column"
      gap="300"
      style={{
        padding: toRem(12),
        borderRadius: config.radii.R300,
        border: `${toRem(1)} solid var(--sable-surface-container-line)`,
        background: 'var(--sable-surface-container)',
        width: '100%',
        maxWidth: '100%',
      }}
    >
      <Box direction="Row" alignItems="Start" justifyContent="SpaceBetween" gap="200">
        <Box direction="Column" gap="100" grow="Yes">
          <Box direction="Row" gap="100" alignItems="Center" wrap="Wrap">
            <Text size="H6">{title}</Text>
            {thirdParty && (
              <TooltipProvider
                position="Top"
                tooltip={
                  <Tooltip style={{ maxWidth: toRem(280) }}>
                    <Text size="T200">
                      Third-party theme. Only use themes from Providers you trust.
                    </Text>
                  </Tooltip>
                }
              >
                {(triggerRef) => (
                  <Icon
                    ref={triggerRef}
                    src={Icons.Warning}
                    size="100"
                    filled
                    style={{ color: 'var(--sable-warn-on-container)', flexShrink: 0 }}
                    aria-label="Third-party theme"
                  />
                )}
              </TooltipProvider>
            )}
          </Box>
          {subtitle && (
            <Text size="T200" priority="300" style={{ wordBreak: 'break-word' }}>
              {subtitle}
            </Text>
          )}
        </Box>

        <Box direction="Row" gap="100" alignItems="Center" shrink="No">
          {copyText && (
            <IconButton
              size="300"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              aria-label={copied ? 'Copied theme link' : 'Copy theme link'}
              onClick={() => {
                handleCopy().catch(() => undefined);
              }}
            >
              <Icon size="200" src={copied ? Icons.Check : Icons.Link} />
            </IconButton>
          )}

          {onExport && (
            <IconButton
              size="300"
              variant="Secondary"
              fill="Soft"
              outlined
              radii="300"
              aria-label="Export theme CSS"
              onClick={() => {
                onExport();
              }}
            >
              <Icon size="200" src={Icons.Download} />
            </IconButton>
          )}

          {typeof isFavorited === 'boolean' && onToggleFavorite && (
            <IconButton
              size="300"
              variant={isFavorited ? 'Primary' : 'Secondary'}
              fill="Soft"
              outlined
              radii="300"
              aria-label={isFavorited ? 'Remove from saved' : 'Save theme'}
              onClick={() => {
                Promise.resolve(onToggleFavorite()).catch(() => undefined);
              }}
            >
              <Icon size="200" src={Icons.Star} filled={isFavorited} />
            </IconButton>
          )}
        </Box>
      </Box>

      {beforePreview}

      {styleBlock ? (
        <>
          <style>{styleBlock}</style>
          <Box
            className={scopeClass}
            direction="Column"
            gap="200"
            style={{
              padding: toRem(12),
              borderRadius: config.radii.R300,
              background: 'var(--sable-bg-container)',
              border: `${toRem(1)} solid var(--sable-surface-container-line)`,
            }}
          >
            <Text size="T300" style={{ color: 'var(--sable-bg-on-container)' }}>
              Sample text
            </Text>
            <Box direction="Row" gap="200" wrap="Wrap">
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${toRem(6)} ${toRem(12)}`,
                  borderRadius: config.radii.Pill,
                  background: 'var(--sable-primary-main)',
                  color: 'var(--sable-primary-on-main)',
                  fontSize: toRem(12),
                  fontWeight: 500,
                }}
              >
                Primary
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${toRem(6)} ${toRem(12)}`,
                  borderRadius: config.radii.Pill,
                  background: 'var(--sable-surface-container)',
                  color: 'var(--sable-surface-on-container)',
                  fontSize: toRem(12),
                }}
              >
                Surface
              </span>
            </Box>
          </Box>
        </>
      ) : (
        <Text size="T300" priority="300">
          No preview tokens
        </Text>
      )}

      <Box direction="Row" gap="200" wrap="Wrap" alignItems="Center" style={{ width: '100%' }}>
        {systemTheme ? (
          <>
            {onApplyLight && (
              <Button
                variant={isAppliedLight ? 'Primary' : 'Secondary'}
                fill="Soft"
                outlined
                size="300"
                radii="300"
                style={{ flex: '1 1 0' }}
                disabled={Boolean(isAppliedLight)}
                onClick={() => Promise.resolve(onApplyLight()).catch(() => undefined)}
              >
                <Text size="B300">Use when OS light</Text>
              </Button>
            )}
            {onApplyDark && (
              <Button
                variant={isAppliedDark ? 'Primary' : 'Secondary'}
                fill="Soft"
                outlined
                size="300"
                radii="300"
                style={{ flex: '1 1 0' }}
                disabled={Boolean(isAppliedDark)}
                onClick={() => Promise.resolve(onApplyDark()).catch(() => undefined)}
              >
                <Text size="B300">Use when OS dark</Text>
              </Button>
            )}
          </>
        ) : (
          onApplyManual && (
            <Button
              variant={isAppliedManual ? 'Primary' : 'Secondary'}
              fill="Soft"
              outlined
              size="300"
              radii="300"
              style={{ flex: onRevert ? '1 1 0' : undefined, width: onRevert ? undefined : '100%' }}
              disabled={Boolean(isAppliedManual)}
              onClick={() => Promise.resolve(onApplyManual()).catch(() => undefined)}
            >
              <Text size="B300">Use theme</Text>
            </Button>
          )
        )}

        {onRevert && (
          <Button
            variant="Secondary"
            fill="Soft"
            outlined
            size="300"
            radii="300"
            disabled={!canRevert}
            style={{ flex: '1 1 0' }}
            onClick={onRevert}
          >
            <Text size="B300">Revert</Text>
          </Button>
        )}
      </Box>
    </Box>
  );
}
