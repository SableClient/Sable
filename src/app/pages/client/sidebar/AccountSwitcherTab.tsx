import { MouseEvent, MouseEventHandler, useCallback, useState } from 'react';
import {
  Box,
  Icon,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  config,
  toRem,
  Chip,
  Spinner,
  Line,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useNavigate } from 'react-router-dom';
import {
  sessionsAtom,
  activeSessionIdAtom,
  Session,
  backgroundUnreadCountsAtom,
} from '$state/sessions';
import {
  SidebarItem,
  SidebarItemTooltip,
  SidebarAvatar,
  SidebarItemBadge,
} from '$components/sidebar';
import { UserAvatar } from '$components/user-avatar';
import { nameInitials } from '$utils/common';
import { getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { stopPropagation } from '$utils/keyboard';
import { getHomePath, getLoginPath, withSearchParam } from '$pages/pathUtils';
import { logoutClient, initClient, stopClient } from '$client/initMatrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useUserProfile } from '$hooks/useUserProfile';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useSessionProfiles } from '$hooks/useSessionProfiles';
import { Settings } from '$features/settings';
import { Modal500 } from '$components/Modal500';
import { createLogger } from '$utils/debug';
import { useClientConfig } from '$hooks/useClientConfig';
import { UnreadBadge, UnreadBadgeCenter } from '$components/unread-badge';

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
          {isActive && (
            <Icon size="200" src={Icons.Check} style={{ color: 'var(--mx-c-success)' }} />
          )}
          {isBusy ? (
            <Spinner size="200" variant="Secondary" />
          ) : (
            <Chip
              variant="Critical"
              fill="None"
              size="400"
              radii="300"
              onClick={(e: MouseEvent) => {
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

export function AccountSwitcherTab() {
  const mx = useMatrixClient();
  const navigate = useNavigate();
  const sessions = useAtomValue(sessionsAtom);
  const [activeSessionId, setActiveSessionId] = useAtom(activeSessionIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const useAuthentication = useMediaAuthentication();
  const backgroundUnreads = useAtomValue(backgroundUnreadCountsAtom);
  const setBackgroundUnreads = useSetAtom(backgroundUnreadCountsAtom);

  // Total unread count across all background sessions (for the sidebar badge).
  const totalBackgroundUnread = Object.entries(backgroundUnreads)
    .filter(([uid]) => uid !== (activeSessionId ?? sessions[0]?.userId))
    .reduce((acc, [, u]) => acc + u.total, 0);
  const totalBackgroundHighlight = Object.entries(backgroundUnreads)
    .filter(([uid]) => uid !== (activeSessionId ?? sessions[0]?.userId))
    .reduce((acc, [, u]) => acc + u.highlight, 0);
  const anyBackgroundHighlight = totalBackgroundHighlight > 0;

  const [menuAnchor, setMenuAnchor] = useState<RectCords>();
  const [busyUserIds, setBusyUserIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeSession = sessions.find((s) => s.userId === activeSessionId) ?? sessions[0];

  const myUserId = mx.getUserId() ?? '';
  const activeProfile = useUserProfile(myUserId);
  const activeAvatarUrl = activeProfile.avatarUrl
    ? (mxcUrlToHttp(mx, activeProfile.avatarUrl, useAuthentication, 96, 96, 'crop') ?? undefined)
    : undefined;
  const activeDisplayName = activeProfile.displayName;

  const sessionProfiles = useSessionProfiles(sessions);

  const { disableAccountSwitcher } = useClientConfig();

  const handleToggle: MouseEventHandler<HTMLButtonElement> = (evt) => {
    if (disableAccountSwitcher) {
      setSettingsOpen(true);
      return;
    }

    const cords = evt.currentTarget.getBoundingClientRect();
    setMenuAnchor((cur) => (cur ? undefined : cords));
  };

  const handleSwitch = useCallback(
    (session: Session) => {
      log.log('switching to account', session.userId);
      setMenuAnchor(undefined);
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
      setMenuAnchor(undefined);
      setBusyUserIds((prev) => new Set(prev).add(session.userId));
      try {
        if (session.userId === mx.getUserId()) {
          await logoutClient(mx, session);
          setSessions({ type: 'DELETE', session });
          const remaining = sessions.filter((s) => s.userId !== session.userId);
          setActiveSessionId(remaining[0]?.userId ?? undefined);
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
            const remaining = sessions.filter((s) => s.userId !== session.userId);
            setActiveSessionId(remaining[0]?.userId ?? undefined);
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
    setMenuAnchor(undefined);
    stopClient(mx);
    setTimeout(() => window.location.assign(url), 100);
  };

  const handleOpenSettings = () => {
    setMenuAnchor(undefined);
    setSettingsOpen(true);
  };

  const activeLocalPart =
    getMxIdLocalPart(activeSession?.userId ?? '') ?? activeSession?.userId ?? '';
  const label = activeDisplayName ?? activeLocalPart;

  if (!activeSession) return null;

  return (
    <SidebarItem active={!!menuAnchor || settingsOpen}>
      <SidebarItemTooltip tooltip={label}>
        {(triggerRef) => (
          <SidebarAvatar
            as="button"
            ref={triggerRef}
            onClick={handleToggle}
            outlined={sessions.length > 1}
          >
            <UserAvatar
              userId={activeSession.userId}
              src={activeAvatarUrl}
              alt={label}
              renderFallback={() => <Text size="H4">{nameInitials(label)}</Text>}
            />
          </SidebarAvatar>
        )}
      </SidebarItemTooltip>
      {(totalBackgroundUnread > 0 || anyBackgroundHighlight) && (
        <SidebarItemBadge hasCount>
          <UnreadBadge
            highlight={anyBackgroundHighlight}
            count={anyBackgroundHighlight ? totalBackgroundHighlight : totalBackgroundUnread}
          />
        </SidebarItemBadge>
      )}

      <PopOut
        anchor={menuAnchor}
        position="Right"
        align="End"
        offset={6}
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              returnFocusOnDeactivate: false,
              onDeactivate: () => setMenuAnchor(undefined),
              clickOutsideDeactivates: true,
              isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
              isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu style={{ minWidth: toRem(240) }}>
              <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
                <Text size="L400" style={{ padding: `${config.space.S100} ${config.space.S200}` }}>
                  Accounts
                </Text>
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
                      onSignOut={handleSignOut}
                    />
                  );
                })}
                <MenuItem
                  size="300"
                  radii="300"
                  before={<Icon size="50" src={Icons.Plus} />}
                  onClick={handleAddAccount}
                >
                  <Text size="T300">Add Account</Text>
                </MenuItem>
                <Line variant="Surface" size="300" style={{ margin: `${config.space.S100} 0` }} />
                <MenuItem
                  size="300"
                  radii="300"
                  before={<Icon size="200" src={Icons.Setting} />}
                  onClick={handleOpenSettings}
                >
                  <Text size="T300">Settings</Text>
                </MenuItem>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />

      {settingsOpen && (
        <Modal500 requestClose={() => setSettingsOpen(false)}>
          <Settings requestClose={() => setSettingsOpen(false)} />
        </Modal500>
      )}
    </SidebarItem>
  );
}
