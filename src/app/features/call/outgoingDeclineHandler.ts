export type OutgoingDeclineEvent = {
  roomId: string;
  declineEventId: string;
  notificationEventId: string;
  senderId: string;
};

export type OutgoingDeclineTrackerState = {
  notificationEventId: string;
  declinerIds: Set<string>;
};

export type OutgoingDeclineTracker = Map<string, OutgoingDeclineTrackerState>;

export type OutgoingDeclineDecision =
  | { kind: 'ignore_partial'; declinedCount: number; targetCount: number }
  | { kind: 'end_call'; declinedCount: number; targetCount: number };

export const applyOutgoingDeclineToTracker = (
  tracker: OutgoingDeclineTracker,
  decline: OutgoingDeclineEvent,
  options: {
    remoteJoinedIds: Set<string>;
    isDirectRoom: boolean;
  }
): OutgoingDeclineDecision => {
  const trackedDecline = tracker.get(decline.roomId);
  const declineState =
    trackedDecline && trackedDecline.notificationEventId === decline.notificationEventId
      ? trackedDecline
      : {
          notificationEventId: decline.notificationEventId,
          declinerIds: new Set<string>(),
        };
  declineState.declinerIds.add(decline.senderId);
  tracker.set(decline.roomId, declineState);

  const targetCount = options.remoteJoinedIds.size;
  const declinedCount = declineState.declinerIds.size;

  if (targetCount === 0 && !options.isDirectRoom) {
    return { kind: 'ignore_partial', declinedCount, targetCount };
  }

  const allRemoteDeclined =
    targetCount > 0 &&
    [...options.remoteJoinedIds].every((userId) => declineState.declinerIds.has(userId));
  const treatAsOneToOne = options.isDirectRoom || targetCount <= 1;

  if (!treatAsOneToOne && targetCount > 0 && !allRemoteDeclined) {
    return { kind: 'ignore_partial', declinedCount, targetCount };
  }

  return { kind: 'end_call', declinedCount, targetCount };
};
