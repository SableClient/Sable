export type CallOwnerKind = 'element' | 'livekit-js' | 'livekit-mobile';

export type CallOwnerLease = {
  kind: CallOwnerKind;
  roomId: string;
  release: () => void;
};

let activeOwner: CallOwnerLease | undefined;

export const acquireCallOwner = (
  kind: CallOwnerKind,
  roomId: string
): CallOwnerLease | undefined => {
  if (activeOwner) return undefined;

  let released = false;
  const lease: CallOwnerLease = {
    kind,
    roomId,
    release: () => {
      if (released || activeOwner !== lease) return;
      released = true;
      activeOwner = undefined;
    },
  };
  activeOwner = lease;
  return lease;
};

export const getActiveCallOwner = (): Pick<CallOwnerLease, 'kind' | 'roomId'> | undefined =>
  activeOwner;

export const releaseCallOwner = (kind: CallOwnerKind, roomId: string): void => {
  if (activeOwner?.kind === kind && activeOwner.roomId === roomId) activeOwner.release();
};

export const resetCallOwnerForTests = (): void => {
  activeOwner = undefined;
};
