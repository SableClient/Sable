import type { MouseEventHandler } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { RectCords } from 'folds';
import {
  Box,
  Button,
  Chip,
  Dialog,
  Header,
  Icon,
  Icons,
  Line,
  Menu,
  MenuItem,
  PopOut,
  Spinner,
  Text,
  config,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { SidebarAvatar, SidebarItem, SidebarItemTooltip } from '../../../components/sidebar';
import { UserAvatar } from '../../../components/user-avatar';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getMxIdLocalPart, mxcUrlToHttp } from '../../../utils/matrix';
import { nameInitials } from '../../../utils/common';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useOpenSettings } from '../../../features/settings';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { Modal500 } from '../../../components/Modal500';
import { stopPropagation } from '../../../utils/keyboard';
import { useUserPresence, Presence } from '../../../hooks/useUserPresence';
import { UserHero, GlobalUserHeroName } from '../../../components/user-profile/UserHero';
import { AvatarPresence, PresenceBadge, PresenceToColor } from '../../../components/presence';
import { createLogger } from '$utils/debug';
import type { Session } from '$state/sessions';
import { activeSessionIdAtom, backgroundUnreadCountsAtom, sessionsAtom } from '$state/sessions';
import { UnreadBadge, UnreadBadgeCenter } from '$components/unread-badge';
import { Check, chipIcon, Plus } from '$components/icons/phosphor';
import { useSessionProfiles } from '$hooks/useSessionProfiles';
import { useClientConfig } from '$hooks/useClientConfig';
import { getHomePath, getLoginPath, getProfilePath, withSearchParam } from '$pages/pathUtils';
import { initClient, logoutClient, stopClient } from '$client/initMatrix';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import { useFocusWithin, useHover } from 'react-aria';
import { ScreenSize, useScreenSizeContext } from '$hooks/useScreenSize';
import { setUserPresence } from '$utils/presence';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { useProfileSelected } from '$hooks/router/useProfileSelected';

const log = createLogger('AccountSwitcherTab');

function AccountRow({
  session,
  isActive,
  displayName,
  avatarUrl,
  isBusy,
  unread,
  onSwitch,
  onSignOut,
}: {
  session: Session;
  isActive: boolean;
  displayName?: string;
  avatarUrl?: string;
  isBusy?: boolean;
  unread?: { total: number; highlight: number };
  onSwitch: (session: Session) => void;
  onSignOut: (session: Session) => void;
}) {
  const localPart = getMxIdLocalPart(session.userId) ?? session.userId;
  const server = session.userId.split(':')[1] ?? session.baseUrl;
  const label = displayName ?? localPart;

  return (
    <MenuItem
      size="400"
      radii="300"
      style={{
        opacity: isBusy ? 0.6 : undefined,
        height: 'auto',
      }}
      before={
        <SidebarAvatar size="200" style={{ width: toRem(28), height: toRem(28) }}>
          <UserAvatar
            userId={session.userId}
            src={avatarUrl}
            alt={label}
            renderFallback={() => <Text size="H6">{nameInitials(label)}</Text>}
          />
        </SidebarAvatar>
      }
      after={
        <Box gap="200" alignItems="Center" shrink="No">
          {!isActive && unread && unread.total > 0 && (
            <UnreadBadgeCenter>
              <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />
            </UnreadBadgeCenter>
          )}
          {isActive && chipIcon(Check, { style: { color: 'var(--mx-c-success)' } })}
          {isBusy ? (
            <Spinner size="200" variant="Secondary" />
          ) : (
            <Chip
              variant="Critical"
              fill="None"
              size="400"
              radii="300"
              onClick={(e) => {
                e.stopPropagation();
                onSignOut(session);
              }}
            >
              <Text size="T200">Sign out</Text>
            </Chip>
          )}
        </Box>
      }
      onClick={() => !isActive && !isBusy && onSwitch(session)}
    >
      <Box
        direction="Column"
        grow="Yes"
        style={{
          paddingTop: config.space.S100,
          paddingBottom: config.space.S100,
          justifyContent: 'Center',
        }}
      >
        <Text size="T300" truncate>
          {label}
        </Text>
        <Text size="T200" priority="300" truncate>
          {isActive ? session.userId : server}
        </Text>
      </Box>
    </MenuItem>
  );
}

export function AccountMenuOption() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const sessions = useAtomValue(sessionsAtom);
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const useAuthentication = useMediaAuthentication();
  const backgroundUnreads = useAtomValue(backgroundUnreadCountsAtom);
  const setBackgroundUnreads = useSetAtom(backgroundUnreadCountsAtom);
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;

  const [isOpen, setIsOpen] = useState(false);
  const { hoverProps } = useHover({
    onHoverChange: (h) => {
      if (!isMobile) setIsOpen(h);
    },
  });
  const { focusWithinProps } = useFocusWithin({
    onFocusWithinChange: (f) => {
      if (!isMobile) setIsOpen(f);
    },
  });

  const [busyUserIds, setBusyUserIds] = useState(new Set());
  const [confirmSignOutSession, setConfirmSignOutSession] = useState<Session | undefined>(
    undefined
  );

  const activeSession = sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];

  const myUserId = mx.getUserId() ?? '';
  const activeProfile = useUserProfile(myUserId);
  const activeAvatarUrl = activeProfile.avatarUrl
    ? (mxcUrlToHttp(mx, activeProfile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;
  const activeDisplayName = activeProfile.displayName;

  const sessionProfiles = useSessionProfiles(sessions);

  const { disableAccountSwitcher } = useClientConfig();

  const handleSwitch = useCallback(
    (session: Session) => {
      log.log('switching to account', session.userId);
      navigate(getHomePath(), { replace: true });
      setActiveSessionId(session.userId);
      // Clear the unread badge for the account we're now switching into.
      setBackgroundUnreads((prev) => {
        const next = { ...prev };
        delete next[session.userId];
        return next;
      });
    },
    [navigate, setActiveSessionId, setBackgroundUnreads]
  );

  const handleSignOut = useCallback(
    async (session: Session) => {
      log.log('signing out', session.userId);
      setBusyUserIds((prev) => new Set(prev).add(session.userId));
      try {
        if (session.userId === mx.getUserId()) {
          await logoutClient(mx, session);
          setSessions({ type: 'DELETE', session });
          setActiveSessionId(
            sessions.find((s) => s.userId !== session.userId)?.userId ?? undefined
          );
          window.location.reload();
        } else {
          try {
            const tempMx = await initClient(session);
            await logoutClient(tempMx, session);
          } catch (err) {
            log.error('failed to logout background session, IndexedDB may remain', err);
          }
          setSessions({ type: 'DELETE', session });
          if (activeSessionId === session.userId) {
            setActiveSessionId(
              sessions.find((s) => s.userId !== session.userId)?.userId ?? undefined
            );
          }
        }
      } catch (err) {
        log.error('Logout failed', err);
      } finally {
        setBusyUserIds((prev) => {
          const next = new Set(prev);
          next.delete(session.userId);
          return next;
        });
      }
    },
    [mx, sessions, activeSessionId, setSessions, setActiveSessionId]
  );

  const handleAddAccount = () => {
    const url = withSearchParam(getLoginPath(), { addAccount: '1' });
    stopClient(mx);
    setTimeout(() => window.location.assign(url), 100);
  };

  if (!activeSession || disableAccountSwitcher) return null;

  return (
    <>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          size="300"
          radii="300"
          before={<Icon size="100" src={Icons.User} />}
          after={
            <Icon size="100" src={isOpen && isMobile ? Icons.ChevronBottom : Icons.ChevronRight} />
          }
          style={{
            position: 'relative',
          }}
          onClick={() => isMobile && setIsOpen(!isOpen)}
          {...hoverProps}
          {...focusWithinProps}
        >
          <Text style={{ flexGrow: 1 }} size="T300">
            Switch account
          </Text>
        </MenuItem>
      </Box>
      {isOpen && (
        <div
          {...hoverProps}
          {...focusWithinProps}
          style={
            isMobile
              ? {}
              : {
                  minWidth: toRem(240),
                  position: 'absolute',
                  left: '98%',
                  padding: toRem(15),
                  bottom: toRem(25),
                }
          }
        >
          <Menu
            style={
              isMobile
                ? {
                    border: 0,
                    boxShadow: 'none',
                    gap: 0,
                  }
                : {}
            }
          >
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              {sessions.map((session) => {
                const isActive = session.userId === (activeSessionId ?? sessions[0]?.userId);
                let rowDisplayName: string | undefined;
                let rowAvatarUrl: string | undefined;
                if (isActive) {
                  rowDisplayName = activeDisplayName;
                  rowAvatarUrl = activeAvatarUrl;
                } else {
                  const prof = sessionProfiles[session.userId];
                  rowDisplayName = prof?.displayName;
                  rowAvatarUrl = prof?.avatarHttpUrl;
                }
                return (
                  <AccountRow
                    key={session.userId}
                    session={session}
                    isActive={isActive}
                    displayName={rowDisplayName}
                    avatarUrl={rowAvatarUrl}
                    isBusy={busyUserIds.has(session.userId)}
                    unread={!isActive ? backgroundUnreads[session.userId] : undefined}
                    onSwitch={handleSwitch}
                    onSignOut={(pendingSession) => {
                      setConfirmSignOutSession(pendingSession);
                    }}
                  />
                );
              })}
              <MenuItem size="300" radii="300" before={chipIcon(Plus)} onClick={handleAddAccount}>
                <Text size="T300">Add Account</Text>
              </MenuItem>
            </Box>
          </Menu>
        </div>
      )}
      {confirmSignOutSession && (
        <Modal500 requestClose={() => setConfirmSignOutSession(undefined)}>
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Sign out</Text>
              </Box>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Text priority="400">
                Are you sure you want to sign out of <b>{confirmSignOutSession.userId}</b>?
              </Text>
              <Box direction="Column" gap="200">
                <Button
                  variant="Critical"
                  onClick={() => {
                    handleSignOut(confirmSignOutSession);
                    setConfirmSignOutSession(undefined);
                  }}
                >
                  <Text size="B400">Sign out</Text>
                </Button>
                <Button variant="Secondary" onClick={() => setConfirmSignOutSession(undefined)}>
                  <Text size="B400">Cancel</Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </Modal500>
      )}
    </>
  );
}

const PresenceOptions: Array<{ value: Presence; label: string }> = [
  { value: Presence.Online, label: 'Online' },
  { value: Presence.Unavailable, label: 'Busy' },
  { value: Presence.Offline, label: 'Offline' },
];

export function PresenceMenuOption({ initialOpen }: { initialOpen: boolean }) {
  const mx = useMatrixClient();
  const [sendPresence] = useSetting(settingsAtom, 'sendPresence');

  const userId = mx.getUserId() ?? '';
  const presence = useUserPresence(userId);
  const screenSize = useScreenSizeContext();
  const isMobile = screenSize === ScreenSize.Mobile;
  const currentPresence = presence?.presence ?? Presence.Online;

  const [isOpen, setIsOpen] = useState(initialOpen);
  const { hoverProps } = useHover({
    onHoverChange: (h) => {
      if (!isMobile) setIsOpen(h);
    },
  });
  const { focusWithinProps } = useFocusWithin({
    onFocusWithinChange: (f) => {
      if (!isMobile) setIsOpen(f);
    },
  });

  const [savingStatus, setSavingStatus] = useState(false);
  const [submittedState, setSubmittedState] = useState<Presence | null>(null);

  useEffect(() => {
    if (!submittedState) return;
    if (currentPresence === submittedState) {
      setSubmittedState(null);
      setSavingStatus(false);
    }
  }, [currentPresence, submittedState]);

  const handleSelectPresence = async (presenceValue: Presence) => {
    if (savingStatus) return;
    setSavingStatus(true);
    setSubmittedState(presenceValue);
    try {
      await setUserPresence(mx, presenceValue);
    } catch {
      setSubmittedState(null);
      setSavingStatus(false);
    }
  };

  if (!sendPresence) return null;

  return (
    <>
      <MenuItem
        size="300"
        radii="300"
        before={
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignContent: 'center',
              width: 18,
            }}
          >
            {savingStatus ? (
              <Spinner
                variant={PresenceToColor[submittedState ?? currentPresence]}
                fill="Soft"
                size="50"
              />
            ) : (
              <PresenceBadge presence={currentPresence} size="300" />
            )}
          </div>
        }
        after={
          <Icon size="100" src={isOpen && isMobile ? Icons.ChevronBottom : Icons.ChevronRight} />
        }
        style={{
          position: 'relative',
        }}
        onClick={() => isMobile && setIsOpen(!isOpen)}
        {...hoverProps}
        {...focusWithinProps}
      >
        <Text style={{ flexGrow: 1 }} size="T300">
          {PresenceOptions.find((v) => v.value == currentPresence)?.label}
        </Text>
      </MenuItem>
      {isOpen && (
        <div
          {...hoverProps}
          {...focusWithinProps}
          style={
            isMobile
              ? {}
              : {
                  minWidth: toRem(240),
                  position: 'absolute',
                  left: '98%',
                  padding: toRem(15),
                  bottom: toRem(65),
                }
          }
        >
          <Menu
            style={
              isMobile
                ? {
                    border: 0,
                    boxShadow: 'none',
                    gap: 0,
                  }
                : {}
            }
          >
            <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
              {PresenceOptions.map((option) => (
                <MenuItem
                  key={option.value}
                  size="300"
                  radii="300"
                  variant={currentPresence === option.value ? 'Primary' : 'Surface'}
                  fill={currentPresence === option.value ? 'Soft' : 'None'}
                  aria-pressed={currentPresence === option.value}
                  disabled={savingStatus}
                  onClick={() => {
                    handleSelectPresence(option.value).catch(() => undefined);
                  }}
                  after={<PresenceBadge presence={option.value} size="400" />}
                >
                  <Text
                    size="T300"
                    style={{
                      flexGrow: 1,
                      fontWeight:
                        currentPresence === option.value ? config.fontWeight.W600 : undefined,
                    }}
                  >
                    {option.label}
                  </Text>
                </MenuItem>
              ))}
            </Box>
          </Menu>
        </div>
      )}
    </>
  );
}

export function UserMenuTab({ isBottom, isMobile }: { isBottom?: boolean; isMobile?: boolean }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const profileSelected = useProfileSelected();
  const navigate = useNavigate();

  const userId = mx.getUserId() ?? '';
  const profile = useUserProfile(userId);
  const presence = useUserPresence(userId);
  const currentStatus = presence?.status ?? '';
  const currentPresence = presence?.presence ?? Presence.Online;

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const openSettings = useOpenSettings();

  const displayName = profile.displayName ?? getMxIdLocalPart(userId) ?? userId;
  const avatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;
  const heroAvatarUrl = profile.avatarUrl
    ? (mxcUrlToHttp(mx, profile.avatarUrl, useAuthentication, 160, 160, 'crop') ?? undefined)
    : undefined;

  const parsedBanner =
    typeof profile.bannerUrl === 'string' ? profile.bannerUrl.replace(/^"|"$/g, '') : undefined;
  const heroBannerUrl = parsedBanner
    ? (mxcUrlToHttp(mx, parsedBanner, useAuthentication, 640, 192, 'scale') ?? undefined)
    : undefined;

  const handleToggle: MouseEventHandler<HTMLButtonElement | HTMLDivElement> = (evt) => {
    if (isMobile) {
      navigate(getProfilePath());
      return;
    }

    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((cur) => (cur ? undefined : cords));
  };

  const handleCloseMenu = () => setMenuAnchor(undefined);

  return (
    <SidebarItem active={!!menuAnchor || profileSelected} isBottom={isBottom}>
      <SidebarItemTooltip
        tooltip={currentStatus || displayName}
        position={isBottom ? 'Top' : 'Right'}
      >
        {(triggerRef) => (
          <Box direction="Column" alignItems="Center" onClick={handleToggle}>
            <SidebarAvatar
              as="button"
              onClick={handleToggle}
              size="400"
              style={{ overflow: 'visible' }}
            >
              <AvatarPresence
                ref={triggerRef}
                badge={<PresenceBadge presence={currentPresence} size="200" />}
              >
                <SidebarAvatar size={isMobile ? '300' : '400'} as="button" onClick={handleToggle}>
                  <UserAvatar
                    userId={userId}
                    src={avatarUrl}
                    alt={userId}
                    renderFallback={() => <Text size="H4">{nameInitials(displayName)}</Text>}
                  />
                </SidebarAvatar>
              </AvatarPresence>
            </SidebarAvatar>
            {isMobile && (
              <Text size="O400" priority="300">
                Account
              </Text>
            )}
          </Box>
        )}
      </SidebarItemTooltip>

      <PopOut
        anchor={menuAnchor}
        position={isBottom ? 'Top' : 'Right'}
        align="End"
        offset={6}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: handleCloseMenu,
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu style={{ minWidth: toRem(320) }}>
              <Box direction="Column" gap="0">
                <Box direction="Column" gap="200">
                  <UserHero
                    userId={userId}
                    avatarUrl={heroAvatarUrl}
                    bannerUrl={heroBannerUrl}
                    presence={presence}
                    showColor={false}
                    allowEditing={true}
                  />
                  <Box style={{ padding: `0 ${config.space.S200} ${config.space.S200}` }}>
                    <GlobalUserHeroName displayName={displayName} userId={userId} />
                  </Box>
                </Box>

                <Line variant="Surface" size="300" />

                <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                  <MenuItem
                    onClick={() => openSettings('account')}
                    size="300"
                    radii="300"
                    before={<Icon size="100" src={Icons.Pencil} />}
                  >
                    <Text style={{ flexGrow: 1 }} size="T300">
                      Edit Profile
                    </Text>
                  </MenuItem>

                  <PresenceMenuOption initialOpen={false} />
                </Box>

                <AccountMenuOption />

                <Line variant="Surface" size="300" />

                <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                  <MenuItem
                    size="300"
                    radii="300"
                    before={<Icon size="100" src={Icons.Setting} />}
                    onClick={() => openSettings()}
                  >
                    <Text style={{ flexGrow: 1 }} size="T300">
                      Settings
                    </Text>
                  </MenuItem>
                </Box>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
    </SidebarItem>
  );
}
