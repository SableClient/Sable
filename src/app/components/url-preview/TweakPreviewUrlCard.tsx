import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Spinner,
  Switch,
  Text,
  Tooltip,
  TooltipProvider,
  config,
  toRem,
} from 'folds';

import { useClientConfig } from '$hooks/useClientConfig';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { usePatchSettings } from '$features/settings/cosmetics/themeSettingsPatch';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom, type ThemeRemoteTweakFavorite } from '$state/settings';
import { copyToClipboard } from '$utils/dom';
import { putCachedThemeCss } from '../../theme/cache';
import { getSableCssPackageKind, parseSableTweakMetadata } from '../../theme/metadata';
import { isHttpsFullSableCssUrl } from '../../theme/previewUrls';
import { buildPreviewStyleBlock, extractSafePreviewCustomProperties } from '../../theme/previewCss';
import { isApprovedCatalogHostUrl, isThirdPartyThemeUrl } from '../../theme/themeApproval';
import { SableChatPreviewPlaceholder } from './SableChatPreviewPlaceholder';
import { ThemeThirdPartyBanner } from './ThemeThirdPartyBanner';

function baseLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'Unofficial tweak';
  }
}

function basenameFromFullSableUrl(url: string): string {
  const tail = url.split('/').pop() ?? url;
  return tail.replace(/\.sable\.css(\?.*)?$/i, '') || 'tweak';
}

function pruneTweakFavorites(
  nextFavorites: ThemeRemoteTweakFavorite[],
  nextEnabledUrls: string[]
): ThemeRemoteTweakFavorite[] {
  const enabled = new Set(nextEnabledUrls);
  return nextFavorites.filter((f) => f.pinned === true || enabled.has(f.fullUrl));
}

function safeSlug(input: string): string {
  return (input || 'tweak').replace(/[^a-zA-Z0-9_-]/g, '-') || 'tweak';
}

type TweakPreviewData = {
  cssText: string;
  displayName: string;
  description?: string;
  author?: string;
  tags: string[];
  basename: string;
};

export function TweakPreviewUrlCard({ url }: { url: string }) {
  const clientConfig = useClientConfig();
  const patchSettings = usePatchSettings();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [autoPreviewApproved] = useSetting(settingsAtom, 'themeChatAutoPreviewApprovedUrls');
  const [autoPreviewAny] = useSetting(settingsAtom, 'themeChatAutoPreviewAnyUrl');
  const [tweakFavorites] = useSetting(settingsAtom, 'themeRemoteTweakFavorites');
  const [enabledTweakFullUrls] = useSetting(settingsAtom, 'themeRemoteEnabledTweakFullUrls');

  const [copied, setCopied] = useTimeoutToggle();

  const isEligibleUrl = useMemo(() => isHttpsFullSableCssUrl(url), [url]);

  const prefixes = clientConfig.themeCatalogApprovedHostPrefixes;

  const isOfficial = useMemo(() => isApprovedCatalogHostUrl(url, prefixes), [prefixes, url]);

  const shouldAutoFetch = useMemo(
    () => (isOfficial && autoPreviewApproved) || (!isOfficial && autoPreviewAny),
    [isOfficial, autoPreviewApproved, autoPreviewAny]
  );

  const [userTriggeredLoad, setUserTriggeredLoad] = useState(false);

  useEffect(() => {
    setUserTriggeredLoad(false);
  }, [url]);

  const fetchEnabled = useMemo(
    () => isEligibleUrl && (shouldAutoFetch || userTriggeredLoad),
    [isEligibleUrl, shouldAutoFetch, userTriggeredLoad]
  );

  const showThirdPartyBanner = useMemo(
    () => !isApprovedCatalogHostUrl(url, prefixes),
    [prefixes, url]
  );

  const tweakPreviewQuery = useQuery({
    queryKey: ['tweak-preview-embed', url],
    enabled: fetchEnabled,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<TweakPreviewData | null> => {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`tweak fetch failed: ${res.status}`);
      const cssText = await res.text();
      if (getSableCssPackageKind(cssText) !== 'tweak') return null;
      const meta = parseSableTweakMetadata(cssText);
      const basename = meta.id?.trim() || basenameFromFullSableUrl(url);
      return {
        cssText,
        displayName: meta.name?.trim() || basenameFromFullSableUrl(url),
        description: meta.description?.trim() || undefined,
        author: meta.author?.trim() || undefined,
        tags: meta.tags ?? [],
        basename,
      };
    },
  });

  const { data } = tweakPreviewQuery;

  const scopeClass = useMemo(() => `sable-tweak-preview--${safeSlug(url)}`, [url]);

  const styleBlock = useMemo(() => {
    if (!data?.cssText) return '';
    const vars = extractSafePreviewCustomProperties(data.cssText);
    return buildPreviewStyleBlock(vars, scopeClass);
  }, [data?.cssText, scopeClass]);

  const handleCopy = useCallback(async () => {
    if (await copyToClipboard(url)) setCopied();
  }, [setCopied, url]);

  const toggleFavorite = useCallback(async () => {
    if (!data) return;
    const existing = tweakFavorites.find((f) => f.fullUrl === url);
    if (existing) {
      const nextFavs = tweakFavorites.filter((f) => f.fullUrl !== url);
      const nextEnabled = enabledTweakFullUrls.filter((u) => u !== url);
      patchSettings({
        themeRemoteTweakFavorites: pruneTweakFavorites(nextFavs, nextEnabled),
        themeRemoteEnabledTweakFullUrls: nextEnabled,
      });
      return;
    }
    await putCachedThemeCss(url, data.cssText);
    if (!mountedRef.current) return;
    const next: ThemeRemoteTweakFavorite = {
      fullUrl: url,
      displayName: data.displayName,
      basename: data.basename,
      pinned: true,
    };
    patchSettings({
      themeRemoteTweakFavorites: pruneTweakFavorites(
        [...tweakFavorites, next],
        enabledTweakFullUrls
      ),
    });
  }, [data, enabledTweakFullUrls, patchSettings, tweakFavorites, url]);

  const setTweakEnabled = useCallback(
    async (apply: boolean) => {
      if (!data) return;
      if (apply) {
        await putCachedThemeCss(url, data.cssText);
        if (!mountedRef.current) return;
        const nextEnabled = enabledTweakFullUrls.includes(url)
          ? [...enabledTweakFullUrls]
          : [...enabledTweakFullUrls, url];
        const nextFavs = [...tweakFavorites];
        if (!nextFavs.some((f) => f.fullUrl === url)) {
          nextFavs.push({
            fullUrl: url,
            displayName: data.displayName,
            basename: data.basename,
            pinned: false,
          });
        }
        patchSettings({
          themeRemoteEnabledTweakFullUrls: nextEnabled,
          themeRemoteTweakFavorites: pruneTweakFavorites(nextFavs, nextEnabled),
        });
      } else {
        const nextEnabled = enabledTweakFullUrls.filter((u) => u !== url);
        patchSettings({
          themeRemoteEnabledTweakFullUrls: nextEnabled,
        });
      }
    },
    [data, enabledTweakFullUrls, patchSettings, tweakFavorites, url]
  );

  if (!isEligibleUrl) return null;

  if (!shouldAutoFetch && !userTriggeredLoad) {
    return (
      <SableChatPreviewPlaceholder
        kind="tweak"
        url={url}
        hostLabel={baseLabel(url)}
        isApprovedHost={isOfficial}
        onLoadPreview={() => {
          setUserTriggeredLoad(true);
        }}
      />
    );
  }

  if (tweakPreviewQuery.isPending) {
    return (
      <Box
        direction="Column"
        gap="200"
        style={{
          width: '400px',
          maxWidth: '100%',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <Box direction="Row" gap="200" alignItems="Center">
          <Spinner variant="Primary" size="400" />
          <Text size="T300">Loading tweak…</Text>
        </Box>
      </Box>
    );
  }

  if (tweakPreviewQuery.isError || data === null || data === undefined) {
    return null;
  }

  const isFav = tweakFavorites.some((f) => f.fullUrl === url);
  const isOn = enabledTweakFullUrls.includes(url);
  const thirdPartyIcon = isThirdPartyThemeUrl(url, clientConfig.themeCatalogApprovedHostPrefixes);

  const descParts = [
    data.description,
    data.author ? `by ${data.author}` : '',
    data.tags.length > 0 ? data.tags.join(', ') : '',
  ].filter(Boolean);
  const descLine = descParts.join(' · ');
  const sourceLabel = isOfficial ? 'Official catalog' : baseLabel(url);

  return (
    <Box
      direction="Column"
      gap="300"
      style={{
        width: '400px',
        maxWidth: '100%',
        flexShrink: 0,
        boxSizing: 'border-box',
        padding: toRem(12),
        borderRadius: config.radii.R300,
        border: `${toRem(1)} solid var(--sable-surface-container-line)`,
        background: 'var(--sable-surface-container)',
      }}
    >
      <Box direction="Row" alignItems="Start" justifyContent="SpaceBetween" gap="200">
        <Box direction="Column" gap="100" grow="Yes" style={{ minWidth: 0 }}>
          <Box direction="Row" gap="100" alignItems="Center" wrap="Wrap">
            <Text size="H6">{data.displayName}</Text>
            {thirdPartyIcon && (
              <TooltipProvider
                position="Top"
                tooltip={
                  <Tooltip style={{ maxWidth: toRem(280) }}>
                    <Text size="T200">Third-party tweak. Only enable CSS you trust.</Text>
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
                    aria-label="Third-party tweak"
                  />
                )}
              </TooltipProvider>
            )}
          </Box>
          {descLine ? (
            <Text size="T200" priority="300" style={{ wordBreak: 'break-word' }}>
              {descLine}
            </Text>
          ) : null}
          <Text size="T200" priority="300">
            {sourceLabel}
          </Text>
        </Box>

        <Box direction="Row" gap="100" alignItems="Center" shrink="No">
          <IconButton
            size="300"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            aria-label={copied ? 'Copied tweak link' : 'Copy tweak link'}
            onClick={() => {
              handleCopy().catch(() => undefined);
            }}
          >
            <Icon size="200" src={copied ? Icons.Check : Icons.Link} />
          </IconButton>
          <IconButton
            size="300"
            variant={isFav ? 'Primary' : 'Secondary'}
            fill="Soft"
            outlined
            radii="300"
            aria-label={isFav ? 'Remove tweak from saved' : 'Save tweak'}
            onClick={() => {
              toggleFavorite().catch(() => undefined);
            }}
          >
            <Icon size="200" src={Icons.Star} filled={isFav} />
          </IconButton>
          <Switch
            variant="Primary"
            value={isOn}
            onChange={(v) => {
              setTweakEnabled(v).catch(() => undefined);
            }}
          />
        </Box>
      </Box>

      {showThirdPartyBanner ? (
        <ThemeThirdPartyBanner kind="tweak" hostLabel={baseLabel(url)} />
      ) : undefined}

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
                  fontWeight: 500,
                }}
              >
                Surface
              </span>
            </Box>
          </Box>
        </>
      ) : null}
    </Box>
  );
}
