import { atom } from 'jotai';
import type {
  LivekitJsControllerFailure,
  LivekitJsControllerLifecycle,
  LivekitJsMediaFacade,
} from '$features/call/livekitJsController';
import type { Room as LivekitRoom } from 'livekit-client';
import type { NativeCallSession } from './nativeCall';

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
  nativeCall: NativeCallSession | undefined,
  livekitJsCall: LivekitJsCallSession | undefined
): Element | NativeCallSession | LivekitJsCallSession | undefined => {
  if (elementCall) return elementCall;
  if (nativeCall && nativeCall.lifecycle !== 'error') return nativeCall;
  if (isLivekitJsCallActive(livekitJsCall)) return livekitJsCall;
  return undefined;
};
