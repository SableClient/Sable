import { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  IconSrc,
  MenuItem,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { PageNav, PageNavContent, PageNavHeader, PageRoot } from '$components/page';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { useUserProfile } from '$hooks/useUserProfile';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { UserAvatar } from '$components/user-avatar';
import { nameInitials } from '$utils/common';
import { UseStateProvider } from '$components/UseStateProvider';
import { stopPropagation } from '$utils/keyboard';
import { LogoutDialog } from '$components/LogoutDialog';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { Notifications } from './notifications';
import { Devices } from './devices';
import { EmojisStickers } from './emojis-stickers';
import { DeveloperTools } from './developer-tools';
import { About } from './about';
import { Account } from './account';
import { General } from './general';
import { Cosmetics } from './cosmetics/Cosmetics';
import { Experimental } from './experimental/Experimental';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { PerMessageProfilePage } from './Persona/ProfilesPage';

export enum SettingsPages {
  GeneralPage,
  AccountPage,
  PerMessageProfilesPage,
  NotificationPage,
  DevicesPage,
  EmojisStickersPage,
  CosmeticsPage,
  DeveloperToolsPage,
  ExperimentalPage,
  AboutPage,
  KeyboardShortcutsPage,
}

type SettingsMenuItem = {
  page: SettingsPages;
  name: string;
  icon: IconSrc;
  activeIcon?: IconSrc;
};

const useSettingsMenuItems = (showPersona: boolean): SettingsMenuItem[] =>
  useMemo(() => {
    const items: SettingsMenuItem[] = [
      {
        page: SettingsPages.GeneralPage,
        name: 'General',
        icon: Icons.Setting,
      },
      {
        page: SettingsPages.AccountPage,
        name: 'Account',
        icon: Icons.User,
      },
      {
        page: SettingsPages.CosmeticsPage,
        name: 'Appearance',
        icon: Icons.Alphabet,
        activeIcon: Icons.AlphabetUnderline,
      },
      {
        page: SettingsPages.NotificationPage,
        name: 'Notifications',
        icon: Icons.Bell,
      },
      {
        page: SettingsPages.DevicesPage,
        name: 'Devices',
        icon: Icons.Monitor,
      },
      {
        page: SettingsPages.EmojisStickersPage,
        name: 'Emojis & Stickers',
        icon: Icons.Smile,
      },
      {
        page: SettingsPages.DeveloperToolsPage,
        name: 'Developer Tools',
        icon: Icons.Terminal,
      },
      {
        page: SettingsPages.ExperimentalPage,
        name: 'Experimental',
        icon: Icons.Funnel,
      },
      {
        page: SettingsPages.AboutPage,
        name: 'About',
        icon: Icons.Info,
      },
      {
        page: SettingsPages.KeyboardShortcutsPage,
        name: 'Keyboard Shortcuts',
        icon: Icons.BlockCode,
      },
    ];

    if (showPersona) {
      items.splice(2, 0, {
        page: SettingsPages.PerMessageProfilesPage,
        name: 'Persona',
        icon: Icons.User,
      });
    }

    return items;
  }, [showPersona]);

type SettingsProps = {
  initialPage?: SettingsPages;
  requestClose: () => void;
};
export function Settings({ initialPage, requestClose }: SettingsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [showPersona] = useSetting(settingsAtom, 'showPersonaSetting');

  const screenSize = useScreenSizeContext();
  const [activePage, setActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage === SettingsPages.PerMessageProfilesPage && !showPersona) {
      return SettingsPages.GeneralPage;
    }
    if (initialPage) return initialPage;
    return screenSize === ScreenSize.Mobile ? undefined : SettingsPages.GeneralPage;
  });

  const menuItems = useSettingsMenuItems(showPersona);

  const handlePageRequestClose = () => {
    if (screenSize === ScreenSize.Mobile) {
      setActivePage(undefined);
      return;
    }
    requestClose();
  };

  return (
    <PageRoot
      nav={
        screenSize === ScreenSize.Mobile && activePage !== undefined ? undefined : (
          <PageNav size="300">
            <PageNavHeader outlined={false}>
              <Box grow="Yes" gap="200">
                <Avatar size="200" radii="300">
                  <UserAvatar
                    userId={userId}
                    src={avatarUrl}
                    renderFallback={() => <Text size="H6">{nameInitials(displayName)}</Text>}
                  />
                </Avatar>
                <Text size="H4" truncate>
                  Settings
                </Text>
              </Box>
              <Box shrink="No">
                {screenSize === ScreenSize.Mobile && (
                  <IconButton onClick={requestClose} variant="Background">
                    <Icon src={Icons.Cross} />
                  </IconButton>
                )}
              </Box>
            </PageNavHeader>
            <Box grow="Yes" direction="Column">
              <PageNavContent>
                <div style={{ flexGrow: 1 }}>
                  {menuItems.map((item) => {
                    const currentIcon =
                      activePage === item.page && item.activeIcon ? item.activeIcon : item.icon;

                    return (
                      <MenuItem
                        key={item.name}
                        variant="Background"
                        radii="400"
                        aria-pressed={activePage === item.page}
                        before={
                          <Icon src={currentIcon} size="100" filled={activePage === item.page} />
                        }
                        onClick={() => setActivePage(item.page)}
                      >
                        <Text
                          style={{
                            fontWeight:
                              activePage === item.page ? config.fontWeight.W600 : undefined,
                          }}
                          size="T300"
                          truncate
                        >
                          {item.name}
                        </Text>
                      </MenuItem>
                    );
                  })}
                </div>
              </PageNavContent>
              <Box style={{ padding: config.space.S200 }} shrink="No" direction="Column">
                <UseStateProvider initial={false}>
                  {(logout, setLogout) => (
                    <>
                      <Button
                        size="300"
                        variant="Critical"
                        fill="None"
                        radii="Pill"
                        before={<Icon src={Icons.Power} size="100" />}
                        onClick={() => setLogout(true)}
                      >
                        <Text size="B400">Logout</Text>
                      </Button>
                      {logout && (
                        <Overlay open backdrop={<OverlayBackdrop />}>
                          <OverlayCenter>
                            <FocusTrap
                              focusTrapOptions={{
                                onDeactivate: () => setLogout(false),
                                clickOutsideDeactivates: true,
                                escapeDeactivates: stopPropagation,
                              }}
                            >
                              <LogoutDialog handleClose={() => setLogout(false)} />
                            </FocusTrap>
                          </OverlayCenter>
                        </Overlay>
                      )}
                    </>
                  )}
                </UseStateProvider>
              </Box>
            </Box>
          </PageNav>
        )
      }
    >
      {activePage === SettingsPages.GeneralPage && (
        <General requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.AccountPage && (
        <Account requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.PerMessageProfilesPage && showPersona && (
        <PerMessageProfilePage requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.CosmeticsPage && (
        <Cosmetics requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.NotificationPage && (
        <Notifications requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.DevicesPage && (
        <Devices requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.EmojisStickersPage && (
        <EmojisStickers requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.DeveloperToolsPage && (
        <DeveloperTools requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.ExperimentalPage && (
        <Experimental requestClose={handlePageRequestClose} />
      )}
      {activePage === SettingsPages.AboutPage && <About requestClose={handlePageRequestClose} />}
      {activePage === SettingsPages.KeyboardShortcutsPage && (
        <KeyboardShortcuts requestClose={handlePageRequestClose} />
      )}
    </PageRoot>
  );
}
