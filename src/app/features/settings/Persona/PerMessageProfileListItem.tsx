import { color, Box, Text, Avatar, Chip } from 'folds';
import type { MatrixClient } from '$types/matrix-sdk';
import { useCallback, useMemo } from 'react';
import { nameInitials } from '$utils/common';
import { mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { UserAvatar } from '$components/user-avatar';
import type { PronounSet } from '$utils/pronouns';
import { SettingTile } from '$components/setting-tile';
import { toSettingsFocusIdPart } from '../settingsLink';
import { Pronouns } from '$features/room/message';
import { ThemeKind, useActiveTheme } from '$hooks/useTheme';

/**
 * the props we use for the per-message profile list item, which is used to display a per-message profile. This is used in the settings page when the user wants to view all of their profiles.
 */
type PerMessageProfileListItemProps = {
  mx: MatrixClient;
  profileId: string;
  avatarMxcUrl?: string;
  displayName?: string;
  nameColorLight?: string;
  nameColorDark?: string;
  pronouns?: PronounSet[];
  onOpenEditor: (profileId: string) => void;
};

export function PerMessageProfileListItem({
  mx,
  profileId,
  avatarMxcUrl,
  displayName,
  pronouns = Array<PronounSet>(),
  nameColorLight,
  nameColorDark,
  onOpenEditor,
}: Readonly<PerMessageProfileListItemProps>) {
  const useAuthentication = useMediaAuthentication();
  const activeTheme = useActiveTheme();
  const nameColor = useMemo(
    () => (activeTheme.kind === ThemeKind.Dark ? nameColorDark : nameColorLight),
    [activeTheme, nameColorLight, nameColorDark]
  );

  const avatarUrl = useMemo(() => {
    if (avatarMxcUrl) {
      return mxcUrlToHttp(mx, avatarMxcUrl, useAuthentication, 96, 96, 'crop') ?? undefined;
    }
    return undefined;
  }, [avatarMxcUrl, mx, useAuthentication]);

  const handleOpenEditor = useCallback(() => onOpenEditor(profileId), [profileId, onOpenEditor]);

  return (
    <SettingTile
      focusId={`persona-${toSettingsFocusIdPart(profileId)}`}
      showSettingLinkAction={false}
      title={
        <Text style={{ color: nameColor ?? undefined }}>
          {displayName ?? 'Unnamed Profile'}
          <Pronouns pronouns={pronouns} tagColor={nameColor ?? color.Primary.Main} />
        </Text>
      }
      description={profileId}
      before={
        <Avatar
          size="300"
          radii="300"
          style={{
            width: 'clamp(25px, 8vw, 50px)',
            height: 'clamp(25px, 8vw, 50px)',
            minWidth: 48,
            minHeight: 48,
            maxWidth: 72,
            maxHeight: 72,
          }}
          aria-label="Profile avatar"
        >
          <UserAvatar
            userId={profileId}
            src={avatarUrl}
            fallbackColor={nameColorLight}
            renderFallback={() => (
              <Box>
                <Text size="H4" aria-label="Avatar fallback">
                  {nameInitials(displayName ?? '?')}
                </Text>
              </Box>
            )}
            alt={`Avatar for profile ${profileId}`}
          />
        </Avatar>
      }
      after={
        <Chip variant="Secondary" radii="Pill" onClick={handleOpenEditor}>
          <Text size="B300">Edit</Text>
        </Chip>
      }
    ></SettingTile>
  );
}
