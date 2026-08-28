import { Box, Text, color, config, Menu, Line, MenuItem } from 'folds';
import { GearSix, menuIcon } from '$components/icons/phosphor';
import { PageNavHeader } from '$components/page';
import { SidebarPanel } from '$components/page/SidebarPanel';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import {
  AccountMenuOption,
  PresenceMenuOption,
  UnverifiedMenuOption,
} from '../sidebar/UserMenuTab';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { GlobalUserHeroName, UserHero } from '$components/user-profile/UserHero';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useUserPresence } from '$hooks/useUserPresence';
import { useUserProfile } from '$hooks/useUserProfile';
import { useOpenSettings } from '$features/settings';
import { PencilSimpleIcon, SignOutIcon } from '@phosphor-icons/react';
import { UseStateProvider } from '$components/UseStateProvider';
import { LogoutDialogOverlay } from '$components/LogoutDialogOverlay';
import { getMxIdServer } from '$utils/mxIdHelper';

export function ProfileMobile() {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const openSettings = useOpenSettings();

  const userId = mx.getUserId() ?? '';
  const server = getMxIdServer(userId);
  const profile = useUserProfile(userId);
  const presence = useUserPresence(userId);

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const heroAvatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 160, 160, 'crop') ?? undefined)
    : undefined;

  const parsedBanner =
    typeof profile.bannerUrl === 'string' ? profile.bannerUrl.replace(/^"|"$/g, '') : undefined;
  const heroBannerUrl = parsedBanner
    ? (mxcUrlToHttp(mx, parsedBanner, useAuthentication, 640, 192, 'scale') ?? undefined)
    : undefined;

  const isMobile = useScreenSizeContext() === ScreenSize.Mobile;

  return (
    <>
      {!isMobile && <SidebarPanel title="Profile" />}
      <Box
        direction="Column"
        gap="0"
        alignItems="Center"
        justifyContent="SpaceBetween"
        style={{
          width: '100%',
          minWidth: '100%',
          background: color.Background.Container,
        }}
      >
        <PageNavHeader size="600" style={{ width: '100%' }}>
          <Box grow="Yes" alignItems="Center" style={{ position: 'relative' }}>
            <Text size="H4" align="Center" truncate style={{ width: '100%' }}>
              Account
            </Text>
          </Box>
        </PageNavHeader>
        <Menu
          style={{
            minWidth: '100%',
            minHeight: '100%',
            overflowY: 'scroll',
            border: 'none',
            background: color.Background.Container,
          }}
        >
          <Box direction="Column" gap="200">
            <UserHero
              userId={userId}
              avatarUrl={heroAvatarUrl}
              bannerUrl={heroBannerUrl}
              presence={presence}
              showColor={false}
              allowEditing={true}
            />

            <Box style={{ padding: `0 ${config.space.S400}` }}>
              <GlobalUserHeroName displayName={displayName} userId={userId} server={server} />
            </Box>
          </Box>

          <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
            <UnverifiedMenuOption />
            <MenuItem
              size="300"
              radii="300"
              before={menuIcon(PencilSimpleIcon)}
              onClick={() => openSettings('account')}
              style={{ background: color.Background.Container }}
            >
              <Text style={{ flexGrow: 1 }} size="T300">
                Edit profile
              </Text>
            </MenuItem>
          </Box>
          <Line variant="Surface" size="300" />

          <Box direction="Column" style={{ padding: config.space.S100 }}>
            <PresenceMenuOption isMobile />
          </Box>
          <AccountMenuOption isMobile />
          <Line variant="Surface" size="300" />

          <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
            <MenuItem
              size="300"
              radii="300"
              before={menuIcon(GearSix)}
              onClick={() => openSettings()}
              style={{ background: color.Background.Container }}
            >
              <Text style={{ flexGrow: 1 }} size="T300">
                Open settings
              </Text>
            </MenuItem>
            <UseStateProvider initial={false}>
              {(logout, setLogout) => (
                <>
                  <MenuItem
                    size="300"
                    variant="Critical"
                    fill="None"
                    before={menuIcon(SignOutIcon)}
                    onClick={() => setLogout(true)}
                  >
                    <Text size="T300">Logout</Text>
                  </MenuItem>
                  {logout && <LogoutDialogOverlay requestClose={() => setLogout(false)} />}
                </>
              )}
            </UseStateProvider>
            <div style={{ height: '20vh' }} />
          </Box>
        </Menu>
      </Box>
    </>
  );
}
