import { atom } from 'jotai';

export type NativeCallLifecycle = 'starting' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type NativeCallSession = {
  roomId: string;
  connectionId: string;
  lifecycle: NativeCallLifecycle;
  error?: string;
  hangup: () => Promise<void>;
};

export const nativeCallAtom = atom<NativeCallSession | undefined>(undefined);

export const isNativeCallActive = (session: NativeCallSession | undefined): boolean =>
  session?.lifecycle !== undefined && session.lifecycle !== 'error';
