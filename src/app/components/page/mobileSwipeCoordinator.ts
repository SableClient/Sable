const GESTURE_LOCK_THRESHOLD = 8;
const DRAWER_COMMIT_FRACTION = 0.22;
const DRAWER_VELOCITY_THRESHOLD = 0.45;

export type MobileGestureMode = 'pending' | 'vertical' | 'drawer' | 'message' | 'chat' | 'blocked';

export function classifyMobileGesture({
  distanceX,
  distanceY,
  startPosition,
  width,
  canOpenRoom,
  hasMessage,
  hasChat,
}: {
  distanceX: number;
  distanceY: number;
  startPosition: number;
  width: number;
  canOpenRoom: boolean;
  hasMessage: boolean;
  hasChat: boolean;
}): MobileGestureMode {
  if (Math.max(Math.abs(distanceX), Math.abs(distanceY)) < GESTURE_LOCK_THRESHOLD) {
    return 'pending';
  }
  if (Math.abs(distanceY) >= Math.abs(distanceX)) return 'vertical';
  if (
    (distanceX > 0 && startPosition < 0) ||
    (distanceX < 0 && startPosition > -width && canOpenRoom)
  ) {
    return 'drawer';
  }
  if (distanceX < 0 && hasMessage) return 'message';
  if (distanceX < 0 && hasChat) return 'chat';
  return 'blocked';
}

export function getDrawerSettlePosition({
  startPosition,
  distanceX,
  velocityX,
  width,
  cancelled,
}: {
  startPosition: number;
  distanceX: number;
  velocityX: number;
  width: number;
  cancelled: boolean;
}): number {
  const startedInRoom = startPosition <= -width / 2;
  if (cancelled) return startedInRoom ? -width : 0;

  const passedDistance = Math.abs(distanceX) >= width * DRAWER_COMMIT_FRACTION;
  const passedVelocity = Math.abs(velocityX) >= DRAWER_VELOCITY_THRESHOLD;
  if (startedInRoom && distanceX > 0 && (passedDistance || passedVelocity)) return 0;
  if (!startedInRoom && distanceX < 0 && (passedDistance || passedVelocity)) return -width;
  return startedInRoom ? -width : 0;
}
