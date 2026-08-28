import { atom, useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useMemo } from 'react';
import type { Settings, settingsAtom as sAtom } from '$state/settings';

export type ResolvedHiddenEventSettings = {
  showHiddenEvents: boolean;
  showTombstoneEvents: boolean;
  hiddenEventEdits: boolean;
  hiddenEventRedactionTimeline: boolean;
  hiddenEventReactions: boolean;
  hiddenEventReactionTombstone: boolean;
  hiddenEventReactionRedactionTimeline: boolean;
  hiddenEventOther: boolean;
};

const resolveHiddenEventSettings = (settings: Settings): ResolvedHiddenEventSettings => {
  const { showHiddenEvents } = settings;
  return {
    showHiddenEvents,
    showTombstoneEvents: showHiddenEvents && settings.showTombstoneEvents,
    hiddenEventEdits: showHiddenEvents && settings.hiddenEventEdits,
    hiddenEventRedactionTimeline: showHiddenEvents && settings.hiddenEventRedactionTimeline,
    hiddenEventReactions: showHiddenEvents && settings.hiddenEventReactions,
    hiddenEventReactionTombstone: showHiddenEvents && settings.hiddenEventReactionTombstone,
    hiddenEventReactionRedactionTimeline:
      showHiddenEvents && settings.hiddenEventReactionRedactionTimeline,
    hiddenEventOther: showHiddenEvents && settings.hiddenEventOther,
  };
};

const isResolvedHiddenEventSettingsEqual = (
  a: ResolvedHiddenEventSettings,
  b: ResolvedHiddenEventSettings
): boolean =>
  a.showHiddenEvents === b.showHiddenEvents &&
  a.showTombstoneEvents === b.showTombstoneEvents &&
  a.hiddenEventEdits === b.hiddenEventEdits &&
  a.hiddenEventRedactionTimeline === b.hiddenEventRedactionTimeline &&
  a.hiddenEventReactions === b.hiddenEventReactions &&
  a.hiddenEventReactionTombstone === b.hiddenEventReactionTombstone &&
  a.hiddenEventReactionRedactionTimeline === b.hiddenEventReactionRedactionTimeline &&
  a.hiddenEventOther === b.hiddenEventOther;

export const useHiddenEventSettings = (settingsAtom: typeof sAtom): ResolvedHiddenEventSettings => {
  const hiddenSettingsAtom = useMemo(
    () => selectAtom(settingsAtom, resolveHiddenEventSettings, isResolvedHiddenEventSettingsEqual),
    [settingsAtom]
  );
  return useAtomValue(hiddenSettingsAtom);
};

export type SettingSetter<K extends keyof Settings> =
  | Settings[K]
  | ((s: Settings[K]) => Settings[K]);

export const useSetSetting = <K extends keyof Settings>(settingsAtom: typeof sAtom, key: K) => {
  const setterAtom = useMemo(
    () =>
      atom<null, [SettingSetter<K>], undefined>(null, (get, set, value) => {
        const s = { ...get(settingsAtom) };
        s[key] = typeof value === 'function' ? value(s[key]) : value;
        set(settingsAtom, s);
      }),
    [settingsAtom, key]
  );

  return useSetAtom(setterAtom);
};

export const useSetting = <K extends keyof Settings>(
  settingsAtom: typeof sAtom,
  key: K
): [Settings[K], ReturnType<typeof useSetSetting<K>>] => {
  const selector = useMemo(() => (s: Settings) => s[key], [key]);
  const setting = useAtomValue(selectAtom(settingsAtom, selector));

  const setter = useSetSetting(settingsAtom, key);
  return [setting, setter];
};
