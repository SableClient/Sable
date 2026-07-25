import { useCallback, useMemo } from 'react';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { Box, Button, IconButton, Spinner, Switch, Text, config, toRem } from 'folds';

import { Star, sizedIcon } from '$components/icons/phosphor';
import { getCspNonce } from '$utils/cspNonce';
import { ThemePreviewCard } from '$components/theme/ThemePreviewCard';
import { CssViewerButton } from '$components/theme/CssViewerButton';
import { usePatchSettings } from '$features/settings/cosmetics/themeSettingsPatch';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useClientConfig } from '$hooks/useClientConfig';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSetting } from '$state/hooks/settings';
import {
  settingsAtom,
  type Settings,
  type ThemeRemoteFavorite,
  type ThemeRemoteTweakFavorite,
} from '$state/settings';
import {
  processUploadedSableCssAttachment,
  type ProcessedUploadedSableCss,
} from '../../../theme/processThemeImport';
import { isThirdPartyThemeUrl } from '../../../theme/themeApproval';
import {
  buildPreviewStyleBlock,
  extractSafePreviewCustomProperties,
} from '../../../theme/previewCss';
import {
  pruneThemeFavorites,
  pruneThemeTweakFavorites,
  themeSourceLabel,
} from '../../../theme/themeLibrary';
import { decryptFile, downloadEncryptedMedia, downloadMedia, mxcUrlToHttp } from '$utils/matrix';

const MAX_SABLE_CSS_ATTACHMENT_BYTES = 1024 * 1024;

type UploadedSableCssContentProps = {
  body: string;
  mimeType: string;
  url: string;
  size?: number;
  encInfo?: EncryptedAttachmentInfo;
};

type SuccessfulUpload = Extract<ProcessedUploadedSableCss, { ok: true }>;

function UploadedTweakCard({ data }: { data: Extract<SuccessfulUpload, { role: 'tweak' }> }) {
  const patchSettings = usePatchSettings();
  const [favorites] = useSetting(settingsAtom, 'themeRemoteTweakFavorites');
  const [enabledUrls] = useSetting(settingsAtom, 'themeRemoteEnabledTweakFullUrls');
  const isFavorite = favorites.some((favorite) => favorite.fullUrl === data.fullUrl);
  const isEnabled = enabledUrls.includes(data.fullUrl);
  const scopeClass = useMemo(
    () => `sable-uploaded-tweak--${data.basename.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    [data.basename]
  );
  const styleBlock = useMemo(
    () => buildPreviewStyleBlock(extractSafePreviewCustomProperties(data.cssText), scopeClass),
    [data.cssText, scopeClass]
  );

  const makeFavorite = useCallback(
    (pinned: boolean): ThemeRemoteTweakFavorite[] => {
      const existing = favorites.find((favorite) => favorite.fullUrl === data.fullUrl);
      if (existing) {
        return favorites.map((favorite) =>
          favorite.fullUrl === data.fullUrl
            ? {
                ...favorite,
                pinned: pinned ? true : favorite.pinned,
                cssText: favorite.cssText ?? data.cssText,
              }
            : favorite
        );
      }
      return [
        ...favorites,
        {
          fullUrl: data.fullUrl,
          displayName: data.displayName,
          basename: data.basename,
          pinned,
          importedLocal: true,
          cssText: data.cssText,
        },
      ];
    },
    [data, favorites]
  );

  const toggleFavorite = useCallback(() => {
    if (isFavorite) {
      const nextEnabled = enabledUrls.filter((url) => url !== data.fullUrl);
      patchSettings({
        themeRemoteEnabledTweakFullUrls: nextEnabled,
        themeRemoteTweakFavorites: pruneThemeTweakFavorites(
          favorites.filter((favorite) => favorite.fullUrl !== data.fullUrl),
          nextEnabled
        ),
      });
      return;
    }
    patchSettings({ themeRemoteTweakFavorites: makeFavorite(true) });
  }, [data.fullUrl, enabledUrls, favorites, isFavorite, makeFavorite, patchSettings]);

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const nextEnabled = enabled
        ? Array.from(new Set([...enabledUrls, data.fullUrl]))
        : enabledUrls.filter((url) => url !== data.fullUrl);
      patchSettings({
        themeRemoteEnabledTweakFullUrls: nextEnabled,
        themeRemoteTweakFavorites: pruneThemeTweakFavorites(makeFavorite(false), nextEnabled),
      });
    },
    [data.fullUrl, enabledUrls, makeFavorite, patchSettings]
  );

  const description = [
    data.description,
    data.author ? `by ${data.author}` : undefined,
    data.tags.length > 0 ? data.tags.join(', ') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Box
      direction="Column"
      gap="300"
      style={{
        padding: toRem(12),
        borderRadius: config.radii.R300,
        border: `${toRem(1)} solid var(--sable-surface-container-line)`,
        background: 'var(--sable-surface-container)',
      }}
    >
      <Box direction="Row" gap="200" alignItems="Start" justifyContent="SpaceBetween">
        <Box direction="Column" gap="100" grow="Yes">
          <Text size="H6">{data.displayName}</Text>
          <Text size="T200" priority="300">
            {description || 'Uploaded tweak'}
          </Text>
          <Text size="T200" priority="300">
            Source: Uploaded file
          </Text>
        </Box>
        <Box direction="Row" gap="100" alignItems="Center" shrink="No">
          <CssViewerButton
            title={`${data.displayName} — CSS`}
            cssText={data.cssText}
            ariaLabel="View tweak CSS"
          />
          <IconButton
            size="300"
            variant={isFavorite ? 'Primary' : 'Secondary'}
            fill="Soft"
            outlined
            radii="300"
            aria-label={isFavorite ? 'Remove tweak from saved' : 'Save tweak'}
            onClick={toggleFavorite}
          >
            {sizedIcon(Star, '200', { filled: isFavorite })}
          </IconButton>
          <Switch variant="Primary" value={isEnabled} onChange={setEnabled} />
        </Box>
      </Box>
      {styleBlock && (
        <>
          <style nonce={getCspNonce()}>{styleBlock}</style>
          <Box
            className={scopeClass}
            style={{
              padding: toRem(12),
              borderRadius: config.radii.R300,
              background: 'var(--sable-bg-container)',
            }}
          >
            <Text size="T300" style={{ color: 'var(--sable-bg-on-container)' }}>
              Sample text
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}

function UploadedThemeCard({ data }: { data: Extract<SuccessfulUpload, { role: 'theme' }> }) {
  const clientConfig = useClientConfig();
  const patchSettings = usePatchSettings();
  const [favorites] = useSetting(settingsAtom, 'themeRemoteFavorites');
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [manualUrl] = useSetting(settingsAtom, 'themeRemoteManualFullUrl');
  const [lightUrl] = useSetting(settingsAtom, 'themeRemoteLightFullUrl');
  const [darkUrl] = useSetting(settingsAtom, 'themeRemoteDarkFullUrl');
  const fullUrl = data.fullUrl;
  const isFavorite = fullUrl ? favorites.some((favorite) => favorite.fullUrl === fullUrl) : false;

  const ensureFavorite = useCallback(
    (pinned: boolean): ThemeRemoteFavorite[] => {
      if (!fullUrl) return favorites;
      const existing = favorites.find((favorite) => favorite.fullUrl === fullUrl);
      if (existing) {
        return favorites.map((favorite) =>
          favorite.fullUrl === fullUrl && pinned ? { ...favorite, pinned: true } : favorite
        );
      }
      return [
        ...favorites,
        {
          fullUrl,
          displayName: data.displayName,
          basename: data.basename,
          kind: data.kind,
          pinned,
          importedLocal: data.importedLocal,
        },
      ];
    },
    [data, favorites, fullUrl]
  );

  const toggleFavorite = useCallback(() => {
    if (!fullUrl) return;
    if (!isFavorite) {
      patchSettings({ themeRemoteFavorites: ensureFavorite(true) });
      return;
    }
    const partial: Partial<Settings> = {};
    if (manualUrl === fullUrl) {
      partial.themeRemoteManualFullUrl = undefined;
      partial.themeRemoteManualKind = undefined;
    }
    if (lightUrl === fullUrl) {
      partial.themeRemoteLightFullUrl = undefined;
      partial.themeRemoteLightKind = undefined;
    }
    if (darkUrl === fullUrl) {
      partial.themeRemoteDarkFullUrl = undefined;
      partial.themeRemoteDarkKind = undefined;
    }
    patchSettings({
      ...partial,
      themeRemoteFavorites: pruneThemeFavorites(
        favorites.filter((favorite) => favorite.fullUrl !== fullUrl),
        [
          manualUrl === fullUrl ? undefined : manualUrl,
          lightUrl === fullUrl ? undefined : lightUrl,
          darkUrl === fullUrl ? undefined : darkUrl,
        ]
      ),
    });
  }, [darkUrl, ensureFavorite, favorites, fullUrl, isFavorite, lightUrl, manualUrl, patchSettings]);

  const apply = useCallback(
    (slot: 'manual' | 'light' | 'dark') => {
      if (!fullUrl) return;
      const partial: Partial<Settings> = {
        themeRemoteFavorites: pruneThemeFavorites(ensureFavorite(false), [
          slot === 'manual' ? fullUrl : manualUrl,
          slot === 'light' ? fullUrl : lightUrl,
          slot === 'dark' ? fullUrl : darkUrl,
        ]),
      };
      if (slot === 'manual') {
        partial.themeRemoteManualFullUrl = fullUrl;
        partial.themeRemoteManualKind = data.kind;
      } else if (slot === 'light') {
        partial.themeRemoteLightFullUrl = fullUrl;
        partial.themeRemoteLightKind = data.kind;
      } else {
        partial.themeRemoteDarkFullUrl = fullUrl;
        partial.themeRemoteDarkKind = data.kind;
      }
      patchSettings(partial);
    },
    [darkUrl, data.kind, ensureFavorite, fullUrl, lightUrl, manualUrl, patchSettings]
  );

  const kindLabel = data.kind === 'dark' ? 'Dark' : 'Light';
  const subtitle = data.previewOnly
    ? `${kindLabel} · Uploaded preview only — no reachable full theme was provided.`
    : `${kindLabel} · ${data.importedLocal ? 'Uploaded theme' : 'Uploaded preview'}`;

  return (
    <ThemePreviewCard
      title={data.displayName}
      subtitle={subtitle}
      previewCssText={data.previewCssForCard}
      fullCssText={data.fullCssForCard}
      scopeSlug={`upload-${data.basename}`}
      sourceLabel={themeSourceLabel({ importedLocal: data.importedLocal, url: data.fullUrl })}
      thirdParty={
        fullUrl !== undefined &&
        !data.importedLocal &&
        isThirdPartyThemeUrl(fullUrl, clientConfig.themeCatalogApprovedHostPrefixes)
      }
      isFavorited={fullUrl ? isFavorite : undefined}
      onToggleFavorite={fullUrl ? toggleFavorite : undefined}
      systemTheme={systemTheme}
      onApplyLight={systemTheme && fullUrl ? () => apply('light') : undefined}
      onApplyDark={systemTheme && fullUrl ? () => apply('dark') : undefined}
      onApplyManual={!systemTheme && fullUrl ? () => apply('manual') : undefined}
      isAppliedLight={Boolean(fullUrl && lightUrl === fullUrl)}
      isAppliedDark={Boolean(fullUrl && darkUrl === fullUrl)}
      isAppliedManual={Boolean(fullUrl && manualUrl === fullUrl)}
    />
  );
}

export function UploadedSableCssContent({
  body,
  mimeType,
  url,
  size,
  encInfo,
}: UploadedSableCssContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [loadState, load] = useAsyncCallback(
    useCallback(async (): Promise<SuccessfulUpload> => {
      if (typeof size === 'number' && size > MAX_SABLE_CSS_ATTACHMENT_BYTES) {
        throw new Error('Theme CSS attachments must be 1 MiB or smaller.');
      }
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL.');
      const blob = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encrypted) =>
            decryptFile(encrypted, mimeType, encInfo)
          )
        : await downloadMedia(mediaUrl);
      if (blob.size > MAX_SABLE_CSS_ATTACHMENT_BYTES) {
        throw new Error('Theme CSS attachments must be 1 MiB or smaller.');
      }
      const result = await processUploadedSableCssAttachment(
        await blob.text(),
        body,
        `${url}\n${JSON.stringify(encInfo ?? null)}`
      );
      if (!result.ok) throw new Error(result.error);
      return result;
    }, [body, encInfo, mimeType, mx, size, url, useAuthentication])
  );

  if (loadState.status === AsyncStatus.Success) {
    return loadState.data.role === 'theme' ? (
      <UploadedThemeCard data={loadState.data} />
    ) : (
      <UploadedTweakCard data={loadState.data} />
    );
  }

  return (
    <Box direction="Column" gap="200">
      <Button
        variant={loadState.status === AsyncStatus.Error ? 'Critical' : 'Secondary'}
        fill="Soft"
        outlined
        radii="300"
        size="400"
        disabled={loadState.status === AsyncStatus.Loading}
        before={
          loadState.status === AsyncStatus.Loading ? (
            <Spinner fill="Soft" size="100" variant="Secondary" />
          ) : undefined
        }
        onClick={() => load()}
      >
        <Text size="B400">
          {loadState.status === AsyncStatus.Loading
            ? 'Loading theme preview…'
            : loadState.status === AsyncStatus.Error
              ? 'Retry theme preview'
              : 'Load theme preview'}
        </Text>
      </Button>
      {loadState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: 'var(--sable-error)' }}>
          {loadState.error instanceof Error ? loadState.error.message : 'Failed to load theme CSS.'}
        </Text>
      )}
    </Box>
  );
}
