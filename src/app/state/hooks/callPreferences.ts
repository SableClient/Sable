import { createContext, useCallback, useContext } from 'react';
import { useAtom } from 'jotai';
import type { CallPreferences, CallPreferencesAtom } from '../callPreferences';

const CallPreferencesAtomContext = createContext<CallPreferencesAtom | null>(null);
export const CallPreferencesProvider = CallPreferencesAtomContext.Provider;

export const useCallPreferencesAtom = (): CallPreferencesAtom => {
  const atom = useContext(CallPreferencesAtomContext);
  if (!atom) {
    throw new Error('CallPreferencesAtom not provided!');
  }

  return atom;
};

export const useCallPreferences = (): CallPreferences & {
  toggleMicrophone: () => void;
  toggleVideo: () => void;
  toggleSound: () => void;
  setAudioDeviceId: (deviceId: string) => void;
  setVideoDeviceId: (deviceId: string) => void;
  setPreferences: (prefs: CallPreferences) => void;
} => {
  const callPrefAtom = useCallPreferencesAtom();
  const [pref, setPref] = useAtom(callPrefAtom);

  const toggleMicrophone = useCallback(() => {
    const microphone = !pref.microphone;

    setPref({
      ...pref,
      microphone,
      sound: !pref.sound && microphone ? true : pref.sound,
    });
  }, [setPref, pref]);

  const toggleVideo = useCallback(() => {
    const video = !pref.video;

    setPref({ ...pref, video });
  }, [setPref, pref]);

  const toggleSound = useCallback(() => {
    const sound = !pref.sound;

    setPref({
      ...pref,
      microphone: !sound ? false : pref.microphone,
      sound,
    });
  }, [setPref, pref]);

  const setAudioDeviceId = useCallback(
    (audioDeviceId: string) => setPref({ ...pref, audioDeviceId }),
    [setPref, pref]
  );

  const setVideoDeviceId = useCallback(
    (videoDeviceId: string) => setPref({ ...pref, videoDeviceId }),
    [setPref, pref]
  );

  return {
    ...pref,
    setAudioDeviceId,
    setVideoDeviceId,
    toggleMicrophone,
    toggleVideo,
    toggleSound,
    setPreferences: setPref,
  };
};
