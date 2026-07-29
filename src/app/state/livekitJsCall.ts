import { atom } from 'jotai';
import type {
  LivekitJsControllerFailure,
  LivekitJsControllerLifecycle,
  LivekitJsMediaFacade,
} from '$features/call/livekitJsController';
import type { Room as LivekitRoom } from 'livekit-client';

export type LivekitJsCallSession = {
  roomId: string;
  lifecycle: LivekitJsControllerLifecycle;
  failure: LivekitJsControllerFailure | null;
  room?: LivekitRoom;
  media?: LivekitJsMediaFacade;
  hangup: () => Promise<void>;
};

export const livekitJsCallAtom = atom<LivekitJsCallSession | undefined>(undefined);

export const isLivekitJsCallActive = (session: LivekitJsCallSession | undefined): boolean =>
  session?.lifecycle !== undefined &&
  session.lifecycle !== 'idle' &&
  session.lifecycle !== 'failed';

export const selectActiveCallSession = <Element>(
  elementCall: Element | undefined,
  livekitJsCall: LivekitJsCallSession | undefined
): Element | LivekitJsCallSession | undefined => {
  if (elementCall) return elementCall;
  if (isLivekitJsCallActive(livekitJsCall)) return livekitJsCall;
  return undefined;
};
