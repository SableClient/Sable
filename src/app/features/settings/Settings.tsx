import { useMemo, useState } from 'react';
import type { IconSrc } from 'folds';
import {
  Avatar,
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
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
import { About } from './about';
import { Account } from './account';
import { Cosmetics } from './cosmetics/Cosmetics';
import { DeveloperTools } from './developer-tools';
import { Devices } from './devices';
import { EmojisStickers } from './emojis-stickers';
import { Experimental } from './experimental/Experimental';
import { General } from './general';
import { KeyboardShortcuts } from './keyboard-shortcuts';
import { Notifications } from './notifications';
import { PerMessageProfilePage } from './Persona/ProfilesPage';
import { settingsSections, type SettingsSectionId } from './routes';
import { settingsHeader } from './styles.css';
import { useSettingsFocus } from './useSettingsFocus';
import { SettingsLinkProvider } from './SettingsLinkContext';
import { useSettingsLinkBaseUrl } from './useSettingsLinkBaseUrl';

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
  id: SettingsSectionId;
  name: string;
  icon: IconSrc;
  activeIcon?: IconSrc;
};

const settingsMenuIcons: Record<
  SettingsSectionId,
  Pick<SettingsMenuItem, 'icon' | 'activeIcon'>
> = {
  general: { icon: Icons.Setting },
  account: { icon: Icons.User },
  persona: { icon: Icons.User },
  appearance: { icon: Icons.Alphabet, activeIcon: Icons.AlphabetUnderline },
  notifications: { icon: Icons.Bell },
  devices: { icon: Icons.Monitor },
  emojis: { icon: Icons.Smile },
  'developer-tools': { icon: Icons.Terminal },
  experimental: { icon: Icons.Funnel },
  about: { icon: Icons.Info },
  'keyboard-shortcuts': { icon: Icons.BlockCode },
};

const settingsPageToSectionId: Record<SettingsPages, SettingsSectionId> = {
  [SettingsPages.GeneralPage]: 'general',
  [SettingsPages.AccountPage]: 'account',
  [SettingsPages.PerMessageProfilesPage]: 'persona',
  [SettingsPages.NotificationPage]: 'notifications',
  [SettingsPages.DevicesPage]: 'devices',
  [SettingsPages.EmojisStickersPage]: 'emojis',
  [SettingsPages.CosmeticsPage]: 'appearance',
  [SettingsPages.DeveloperToolsPage]: 'developer-tools',
  [SettingsPages.ExperimentalPage]: 'experimental',
  [SettingsPages.AboutPage]: 'about',
  [SettingsPages.KeyboardShortcutsPage]: 'keyboard-shortcuts',
};

const settingsSectionIdToPage: Record<SettingsSectionId, SettingsPages> = {
  general: SettingsPages.GeneralPage,
  account: SettingsPages.AccountPage,
  persona: SettingsPages.PerMessageProfilesPage,
  appearance: SettingsPages.CosmeticsPage,
  notifications: SettingsPages.NotificationPage,
  devices: SettingsPages.DevicesPage,
  emojis: SettingsPages.EmojisStickersPage,
  'developer-tools': SettingsPages.DeveloperToolsPage,
  experimental: SettingsPages.ExperimentalPage,
  about: SettingsPages.AboutPage,
  'keyboard-shortcuts': SettingsPages.KeyboardShortcutsPage,
};

const settingsSectionComponents: Record<
  SettingsSectionId,
  (props: { requestBack?: () => void; requestClose: () => void }) => JSX.Element
> = {
  general: General,
  account: Account,
  persona: PerMessageProfilePage,
  appearance: Cosmetics,
  notifications: Notifications,
  devices: Devices,
  emojis: EmojisStickers,
  'developer-tools': DeveloperTools,
  experimental: Experimental,
  about: About,
  'keyboard-shortcuts': KeyboardShortcuts,
};

type ControlledSettingsProps = {
  activeSection?: SettingsSectionId | null;
  onSelectSection?: (section: SettingsSectionId) => void;
  onBack?: () => void;
  requestClose: () => void;
  initialPage?: SettingsPages;
};

function SettingsSectionViewport({
  section,
  requestBack,
  requestClose,
}: {
  section: SettingsSectionId;
  requestBack?: () => void;
  requestClose: () => void;
}) {
  useSettingsFocus();
  const Section = settingsSectionComponents[section];
  return <Section requestBack={requestBack} requestClose={requestClose} />;
}

export function Settings({
  activeSection,
  onSelectSection,
  onBack,
  requestClose,
  initialPage,
}: ControlledSettingsProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const userId = mx.getUserId()!;
  const profile = useUserProfile(userId);
  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;

  const [showPersona] = useSetting(settingsAtom, 'showPersonaSetting');
  const settingsLinkBaseUrl = useSettingsLinkBaseUrl();
  const screenSize = useScreenSizeContext();
  const isControlled = activeSection !== undefined;

  const [legacyActivePage, setLegacyActivePage] = useState<SettingsPages | undefined>(() => {
    if (initialPage === SettingsPages.PerMessageProfilesPage && !showPersona) {
      return SettingsPages.GeneralPage;
    }
    if (initialPage) return initialPage;
    return screenSize === ScreenSize.Mobile ? undefined : SettingsPages.GeneralPage;
  });

  const visibleSection = useMemo<SettingsSectionId | null>(() => {
    if (isControlled) return activeSection;

    if (legacyActivePage === undefined) {
      return null;
    }

    const section = settingsPageToSectionId[legacyActivePage];
    if (section === 'persona' && !showPersona) {
      return 'general';
    }
    return section;
  }, [activeSection, isControlled, legacyActivePage, showPersona]);

  const menuItems = useMemo<SettingsMenuItem[]>(
    () =>
      settingsSections
        .filter((section) => showPersona || section.id !== 'persona')
        .map((section) => {
          const icon = settingsMenuIcons[section.id];
          return { id: section.id, name: section.label, ...icon };
        }),
    [showPersona]
  );

  const handleSelectSection = (section: SettingsSectionId) => {
    if (isControlled) {
      onSelectSection?.(section);
      return;
    }

    setLegacyActivePage(settingsSectionIdToPage[section]);
  };

  const handleRequestClose = () => {
    if (isControlled) {
      requestClose();
      return;
    }

    if (screenSize === ScreenSize.Mobile) {
      setLegacyActivePage(undefined);
      return;
    }

    requestClose();
  };

  const handleRequestBack = () => {
    if (isControlled) {
      onBack?.();
      return;
    }

    if (screenSize === ScreenSize.Mobile) {
      setLegacyActivePage(undefined);
      return;
    }

    setLegacyActivePage(SettingsPages.GeneralPage);
  };

  const shouldShowSectionBack = visibleSection !== null && screenSize === ScreenSize.Mobile;
  const sectionRequestBack = shouldShowSectionBack ? handleRequestBack : undefined;

  return (
    <PageRoot
      nav={
        screenSize === ScreenSize.Mobile && visibleSection !== null ? undefined : (
          <PageNav size="300">
            <PageNavHeader className={settingsHeader}>
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
                {visibleSection === null && (
                  <IconButton
                    aria-label="Close settings"
                    onClick={handleRequestClose}
                    variant="Background"
                  >
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
                      visibleSection === item.id && item.activeIcon ? item.activeIcon : item.icon;

                    return (
                      <MenuItem
                        key={item.id}
                        variant="Background"
                        radii="400"
                        aria-pressed={visibleSection === item.id}
                        before={
                          <Icon
                            src={currentIcon}
                            size={screenSize === ScreenSize.Mobile ? '200' : '100'}
                            filled={visibleSection === item.id}
                          />
                        }
                        onClick={() => handleSelectSection(item.id)}
                      >
                        <Text
                          style={{
                            fontWeight:
                              visibleSection === item.id ? config.fontWeight.W600 : undefined,
                          }}
                          size={screenSize === ScreenSize.Mobile ? 'T400' : 'T300'}
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
      {visibleSection && (
        <SettingsLinkProvider value={{ section: visibleSection, baseUrl: settingsLinkBaseUrl }}>
          <SettingsSectionViewport
            section={visibleSection}
            requestBack={sectionRequestBack}
            requestClose={handleRequestClose}
          />
        </SettingsLinkProvider>
      )}
    </PageRoot>
  );
}
