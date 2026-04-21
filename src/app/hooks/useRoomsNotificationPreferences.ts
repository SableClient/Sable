import { createContext, useCallback, useContext, useMemo } from 'react';
import type { IPushRules, MatrixClient } from '$types/matrix-sdk';
import { ConditionKind, PushRuleKind, EventType } from '$types/matrix-sdk';
import type { IconSrc } from 'folds';
import { Icons } from 'folds';

import { isRoomId } from '$utils/matrix';
import { useAccountData } from './useAccountData';
import {
  getNotificationMode,
  getNotificationModeActions,
  NotificationMode,
} from './useNotificationMode';
import { useAsyncCallback } from './useAsyncCallback';
import { useMatrixClient } from './useMatrixClient';

export type RoomsNotificationPreferences = {
  mute: Set<string>;
  specialMessages: Set<string>;
  allMessages: Set<string>;
};

const RoomsNotificationPreferencesContext = createContext<RoomsNotificationPreferences | null>(
  null
);
export const RoomsNotificationPreferencesProvider = RoomsNotificationPreferencesContext.Provider;

export const useRoomsNotificationPreferencesContext = (): RoomsNotificationPreferences => {
  const preferences = useContext(RoomsNotificationPreferencesContext);

  if (!preferences) {
    throw new Error('No RoomsNotificationPreferences provided!');
  }

  return preferences;
};

export const useRoomsNotificationPreferences = (): RoomsNotificationPreferences => {
  const pushRules = useAccountData(EventType.PushRules)?.getContent<IPushRules>();

  const preferences: RoomsNotificationPreferences = useMemo(() => {
    const global = pushRules?.global;
    const room = global?.room ?? [];
    const override = global?.override ?? [];

    const pref: RoomsNotificationPreferences = {
      mute: new Set(),
      specialMessages: new Set(),
      allMessages: new Set(),
    };

    override.forEach((rule) => {
      if (isRoomId(rule.rule_id) && getNotificationMode(rule.actions) === NotificationMode.OFF) {
        pref.mute.add(rule.rule_id);
      }
    });
    room.forEach((rule) => {
      if (getNotificationMode(rule.actions) === NotificationMode.OFF) {
        pref.specialMessages.add(rule.rule_id);
      }
    });
    room.forEach((rule) => {
      if (getNotificationMode(rule.actions) !== NotificationMode.OFF) {
        pref.allMessages.add(rule.rule_id);
      }
    });

    return pref;
  }, [pushRules]);

  return preferences;
};

export enum RoomNotificationMode {
  Unset = 'Unset',
  Mute = 'Mute',
  SpecialMessages = 'SpecialMessages',
  AllMessages = 'AllMessages',
}

export const getRoomNotificationMode = (
  preferences: RoomsNotificationPreferences,
  roomId: string
): RoomNotificationMode => {
  if (preferences.mute.has(roomId)) {
    return RoomNotificationMode.Mute;
  }
  if (preferences.specialMessages.has(roomId)) {
    return RoomNotificationMode.SpecialMessages;
  }
  if (preferences.allMessages.has(roomId)) {
    return RoomNotificationMode.AllMessages;
  }

  return RoomNotificationMode.Unset;
};

export const useRoomNotificationPreference = (
  preferences: RoomsNotificationPreferences,
  roomId: string
): RoomNotificationMode =>
  useMemo(() => getRoomNotificationMode(preferences, roomId), [preferences, roomId]);

export const getRoomNotificationModeIcon = (mode?: RoomNotificationMode): IconSrc => {
  if (mode === RoomNotificationMode.Mute) return Icons.BellMute;
  if (mode === RoomNotificationMode.SpecialMessages) return Icons.BellPing;
  if (mode === RoomNotificationMode.AllMessages) return Icons.BellRing;

  return Icons.Bell;
};

export const setRoomNotificationPreference = async (
  mx: MatrixClient,
  roomId: string,
  mode: RoomNotificationMode,
  previousMode: RoomNotificationMode
): Promise<void> => {
  // remove the old preference
  if (
    previousMode === RoomNotificationMode.AllMessages ||
    previousMode === RoomNotificationMode.SpecialMessages
  ) {
    await mx.deletePushRule('global', PushRuleKind.RoomSpecific, roomId);
  }
  if (previousMode === RoomNotificationMode.Mute) {
    await mx.deletePushRule('global', PushRuleKind.Override, roomId);
  }

  // set new preference
  if (mode === RoomNotificationMode.Unset) {
    return;
  }

  if (mode === RoomNotificationMode.Mute) {
    await mx.addPushRule('global', PushRuleKind.Override, roomId, {
      conditions: [
        {
          kind: ConditionKind.EventMatch,
          key: 'room_id',
          pattern: roomId,
        },
      ],
      actions: getNotificationModeActions(NotificationMode.OFF),
    });
    return;
  }

  await mx.addPushRule('global', PushRuleKind.RoomSpecific, roomId, {
    actions:
      mode === RoomNotificationMode.AllMessages
        ? getNotificationModeActions(NotificationMode.NotifyLoud)
        : getNotificationModeActions(NotificationMode.OFF),
  });
};

export const useSetRoomNotificationPreference = (roomId: string) => {
  const mx = useMatrixClient();

  const [modeState, setMode] = useAsyncCallback(
    useCallback(
      (mode: RoomNotificationMode, previousMode: RoomNotificationMode) =>
        setRoomNotificationPreference(mx, roomId, mode, previousMode),
      [mx, roomId]
    )
  );

  return {
    modeState,
    setMode,
  };
};
