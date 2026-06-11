import { atom, useAtomValue, useSetAtom } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useMemo } from 'react';
import {
  type DesktopRuntimeState,
  type DesktopSettingKey,
  type DesktopSettings,
  desktopRuntimeStateAtom,
  desktopSettingsAtom,
  desktopSettingsReadyAtom,
  desktopSettingsSyncingAtom,
} from '$state/desktopSettings';

export type DesktopSettingSetter<K extends DesktopSettingKey> =
  | DesktopSettings[K]
  | ((value: DesktopSettings[K]) => DesktopSettings[K]);

function resolveDesktopSettingValue<K extends DesktopSettingKey>(
  current: DesktopSettings[K],
  value: DesktopSettingSetter<K>
): DesktopSettings[K] {
  if (typeof value === 'function') {
    return (value as (next: DesktopSettings[K]) => DesktopSettings[K])(current);
  }

  return value;
}

export const useSetDesktopSetting = <K extends DesktopSettingKey>(key: K) => {
  const setterAtom = useMemo(
    () =>
      atom<null, [DesktopSettingSetter<K>], Promise<void>>(null, (get, set, value) => {
        const settings = get(desktopSettingsAtom);
        const nextValue = resolveDesktopSettingValue(settings[key], value);
        return set(desktopSettingsAtom, { ...settings, [key]: nextValue } as DesktopSettings);
      }),
    [key]
  );

  return useSetAtom(setterAtom);
};

export const useDesktopSetting = <K extends DesktopSettingKey>(
  key: K
): [DesktopSettings[K], ReturnType<typeof useSetDesktopSetting<K>>] => {
  const selector = useMemo(() => (settings: DesktopSettings) => settings[key], [key]);
  const setting = useAtomValue(selectAtom(desktopSettingsAtom, selector));
  const setter = useSetDesktopSetting(key);

  return [setting, setter];
};

export const useDesktopSettingsReady = (): boolean => useAtomValue(desktopSettingsReadyAtom);
export const useDesktopSettingsSyncing = (): boolean => useAtomValue(desktopSettingsSyncingAtom);

export const useDesktopRuntimeState = (): DesktopRuntimeState =>
  useAtomValue(desktopRuntimeStateAtom);
