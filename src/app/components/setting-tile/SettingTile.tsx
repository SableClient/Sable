import type { ReactNode } from 'react';
import { Box, Icon, IconButton, Icons, Text } from 'folds';
import { BreakWord } from '$styles/Text.css';
import { buildSettingsLink } from '$features/settings/settingsLink';
import { copyToClipboard } from '$utils/dom';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useTimeoutToggle } from '$hooks/useTimeoutToggle';
import { useSettingsLinkContext } from '$features/settings/SettingsLinkContext';
import { type SettingsSectionId } from '$features/settings/routes';
import {
  settingTileSettingLinkAction,
  settingTileSettingLinkActionDesktopHidden,
  settingTileSettingLinkActionMobileVisible,
  settingTileSettingLinkActionTransparentBackground,
  settingTileRoot,
  settingTileTitleRow,
} from './SettingTile.css';

type SettingTileProps = {
  focusId?: string;
  showSettingLinkAction?: boolean;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  children?: ReactNode;
};

function SettingTileSettingLinkAction({
  baseUrl,
  section,
  focusId,
}: {
  baseUrl: string;
  section: SettingsSectionId;
  focusId: string;
}) {
  const screenSize = useScreenSizeContext();
  const [copied, setCopied] = useTimeoutToggle();
  const copyPath = buildSettingsLink(baseUrl, section, focusId);

  return (
    <IconButton
      aria-label={copied ? 'Copied settings link' : 'Copy settings link'}
      className={[
        settingTileSettingLinkAction,
        settingTileSettingLinkActionTransparentBackground,
        screenSize === ScreenSize.Desktop
          ? settingTileSettingLinkActionDesktopHidden
          : settingTileSettingLinkActionMobileVisible,
      ].join(' ')}
      onClick={async () => {
        if (await copyToClipboard(copyPath)) setCopied();
      }}
      size="300"
      variant="Surface"
      fill="None"
      radii="Inherit"
    >
      <Icon src={copied ? Icons.Check : Icons.Link} size="50" />
    </IconButton>
  );
}

export function SettingTile({
  focusId,
  showSettingLinkAction = true,
  className,
  title,
  description,
  before,
  after,
  children,
}: SettingTileProps) {
  const settingsLink = useSettingsLinkContext();
  const copyAction =
    settingsLink && focusId && showSettingLinkAction ? (
      <SettingTileSettingLinkAction
        baseUrl={settingsLink.baseUrl}
        section={settingsLink.section}
        focusId={focusId}
      />
    ) : null;
  const titleAction = title ? copyAction : null;
  const trailingCopyAction = title ? null : copyAction;

  const trailing =
    after || trailingCopyAction ? (
      <Box shrink="No" alignItems="Center" gap="200">
        {after}
        {trailingCopyAction}
      </Box>
    ) : null;

  return (
    <Box
      id={focusId}
      data-settings-focus={focusId}
      className={[settingTileRoot, className].filter(Boolean).join(' ')}
      alignItems="Center"
      gap="300"
    >
      {before && <Box shrink="No">{before}</Box>}
      <Box grow="Yes" direction="Column" gap="100">
        {title && (
          <Box
            data-setting-tile-title-row="true"
            className={settingTileTitleRow}
            alignItems="Center"
            gap="100"
          >
            <Text className={BreakWord} size="T300">
              {title}
            </Text>
            {titleAction}
          </Box>
        )}
        {description && (
          <Text className={BreakWord} size="T200" priority="300">
            {description}
          </Text>
        )}
        {children}
      </Box>
      {trailing}
    </Box>
  );
}
