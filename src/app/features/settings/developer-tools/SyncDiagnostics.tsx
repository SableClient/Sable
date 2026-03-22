import { useEffect, useState } from 'react';
import { Box, Button, Icon, Icons, Text } from 'folds';
import { SequenceCard } from '$components/sequence-card';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { getClientSyncDiagnostics } from '$client/initMatrix';
import { Direction, EventType, NotificationCountType, Room } from '$types/matrix-sdk';
import { Membership } from '$types/matrix/room';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { getUnreadInfo, isNotificationEvent } from '$utils/room';

type RoomRenderingDiagnostics = {
  totalRooms: number;
  joinedRooms: number;
  inviteRooms: number;
  roomsMissingName: number;
  roomsMissingAvatar: number;
  roomsWithoutLiveEvents: number;
  roomsWithBackPagination: number;
};

type UnreadDriftRoom = {
  roomId: string;
  roomName: string;
  sdkTotal: number;
  sdkHighlight: number;
  latestNotificationEventId: string | null;
  readUpToEventId: string | null;
  fullyReadEventId: string | null;
};

const getRoomRenderingDiagnostics = (rooms: Room[]): RoomRenderingDiagnostics => {
  let joinedRooms = 0;
  let inviteRooms = 0;
  let roomsMissingName = 0;
  let roomsMissingAvatar = 0;
  let roomsWithoutLiveEvents = 0;
  let roomsWithBackPagination = 0;

  rooms.forEach((room) => {
    const membership = room.getMyMembership();
    if (membership === Membership.Join) joinedRooms += 1;
    if (membership === Membership.Invite) inviteRooms += 1;

    if (!room.name || room.name.trim().length === 0) roomsMissingName += 1;

    const roomAvatar = room.getMxcAvatarUrl();
    const fallbackAvatar = room.getAvatarFallbackMember()?.getMxcAvatarUrl();
    if (!roomAvatar && !fallbackAvatar) roomsMissingAvatar += 1;

    const liveTimeline = room.getLiveTimeline();
    if (liveTimeline.getEvents().length === 0) roomsWithoutLiveEvents += 1;
    if (liveTimeline.getPaginationToken(Direction.Backward)) roomsWithBackPagination += 1;
  });

  return {
    totalRooms: rooms.length,
    joinedRooms,
    inviteRooms,
    roomsMissingName,
    roomsMissingAvatar,
    roomsWithoutLiveEvents,
    roomsWithBackPagination,
  };
};

const getUnreadDriftRooms = (mx: ReturnType<typeof useMatrixClient>): UnreadDriftRoom[] => {
  const userId = mx.getUserId();
  if (!userId) return [];

  return mx
    .getRooms()
    .filter((room) => !room.isSpaceRoom() && room.getMyMembership() === Membership.Join)
    .reduce<UnreadDriftRoom[]>((driftRooms, room) => {
      const reconciledUnread = getUnreadInfo(room);
      const sdkTotal = room.getUnreadNotificationCount(NotificationCountType.Total);
      const sdkHighlight = room.getUnreadNotificationCount(NotificationCountType.Highlight);
      if (sdkTotal <= 0 && sdkHighlight <= 0) return driftRooms;
      if (reconciledUnread.total <= 0 && reconciledUnread.highlight <= 0) return driftRooms;

      const latestNotificationEvent = [...room.getLiveTimeline().getEvents()]
        .reverse()
        .find((event) => !event.isSending() && isNotificationEvent(event));
      const latestNotificationEventId = latestNotificationEvent?.getId() ?? null;
      if (!latestNotificationEventId) return driftRooms;

      const hasReadLatestNotification = room.hasUserReadEvent(userId, latestNotificationEventId);
      if (!hasReadLatestNotification || sdkHighlight > 0) return driftRooms;

      const readUpToEventId = room.getEventReadUpTo(userId) ?? null;
      const fullyReadEventId =
        room.getAccountData(EventType.FullyRead)?.getContent<{ event_id?: string }>()?.event_id ??
        null;

      driftRooms.push({
        roomId: room.roomId,
        roomName: room.name || room.roomId,
        sdkTotal,
        sdkHighlight,
        latestNotificationEventId,
        readUpToEventId,
        fullyReadEventId,
      });
      return driftRooms;
    }, []);
};

const formatListCoverage = (knownCount: number, rangeEnd: number): string => {
  if (knownCount <= 0) return '0/0';
  const loadedCount = Math.max(0, Math.min(knownCount, rangeEnd + 1));
  return `${loadedCount}/${knownCount}`;
};

const formatSyncReason = (reason: string): string => {
  if (reason === 'sliding_active') return 'Sliding Sync active';
  if (reason === 'sliding_disabled_server') return 'Server-side sliding sync disabled';
  if (reason === 'session_opt_out') return 'Session opt-in is off';
  if (reason === 'missing_proxy') return 'Sliding proxy URL missing';
  if (reason === 'cold_cache_bootstrap') return 'Cold-cache bootstrap (classic for this run)';
  if (reason === 'probe_failed_fallback') return 'Sliding probe failed, using fallback';
  return reason;
};

export function SyncDiagnostics() {
  const mx = useMatrixClient();
  const [, setTick] = useState(0);
  const [expandSliding, setExpandSliding] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const diagnostics = getClientSyncDiagnostics(mx);
  const roomDiagnostics = getRoomRenderingDiagnostics(mx.getRooms());
  const unreadDriftRooms = getUnreadDriftRooms(mx);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Sync Diagnostics</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="100"
      >
        <Box direction="Column" gap="100" style={{ padding: '12px' }}>
          <Text size="T300">
            Transport: {diagnostics.transport}
            {diagnostics.fallbackFromSliding ? ' (fallback)' : ''}
          </Text>
          <Text size="T300">State: {diagnostics.syncState ?? 'null'}</Text>
          <Text size="T300">
            Sliding configured: {diagnostics.slidingConfigured ? 'yes' : 'no'}
          </Text>
          <Text size="T300">
            Sliding server-enabled: {diagnostics.slidingEnabledOnServer ? 'yes' : 'no'}
          </Text>
          <Text size="T300">Sliding session opt-in: {diagnostics.sessionOptIn ? 'yes' : 'no'}</Text>
          <Text size="T300">Sliding requested: {diagnostics.slidingRequested ? 'yes' : 'no'}</Text>
          <Text size="T300">Sync reason: {formatSyncReason(diagnostics.reason)}</Text>
          <Text size="T300">
            Room counts: {roomDiagnostics.totalRooms} total, {roomDiagnostics.joinedRooms} joined,{' '}
            {roomDiagnostics.inviteRooms} invites
          </Text>
          <Text size="T300">Rooms missing name: {roomDiagnostics.roomsMissingName}</Text>
          <Text size="T300">Rooms missing avatar: {roomDiagnostics.roomsMissingAvatar}</Text>
          <Text size="T300">
            Rooms without live events: {roomDiagnostics.roomsWithoutLiveEvents}
          </Text>
          <Text size="T300">
            Rooms with additional history available: {roomDiagnostics.roomsWithBackPagination}
          </Text>
          <Text size="T300">Unread drift rooms: {unreadDriftRooms.length}</Text>
          {unreadDriftRooms.slice(0, 10).map((room) => (
            <Text key={room.roomId} size="T200" priority="300">
              {room.roomName}: sdk {room.sdkTotal}/{room.sdkHighlight} | latest{' '}
              {room.latestNotificationEventId ?? 'null'} | readUpTo {room.readUpToEventId ?? 'null'}{' '}
              | fullyRead {room.fullyReadEventId ?? 'null'}
            </Text>
          ))}

          {diagnostics.sliding && (
            <Box direction="Column" gap="100">
              <Box justifyContent="SpaceBetween" alignItems="Center">
                <Text size="T300">Sliding Sync</Text>
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  outlined
                  radii="300"
                  before={<Icon src={expandSliding ? Icons.ChevronTop : Icons.ChevronBottom} />}
                  onClick={() => setExpandSliding((v) => !v)}
                >
                  <Text size="B300">{expandSliding ? 'Collapse' : 'Expand'}</Text>
                </Button>
              </Box>
              {expandSliding && (
                <Box direction="Column" gap="100">
                  <Text size="T300">Sliding proxy: {diagnostics.sliding.proxyBaseUrl}</Text>
                  <Text size="T300">
                    Room timeline limit: {diagnostics.sliding.timelineLimit} | page size:{' '}
                    {diagnostics.sliding.listPageSize}
                  </Text>
                  {diagnostics.sliding.lists.map((list) => (
                    <Text size="T300" key={list.key}>
                      List `{list.key}` coverage:{' '}
                      {formatListCoverage(list.knownCount, list.rangeEnd)}
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </SequenceCard>
    </Box>
  );
}
