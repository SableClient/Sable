import { useCallback } from 'react';
import type { IPushRules, RuleId } from '$types/matrix-sdk';
import { type PushRuleData, usePushRule } from '$hooks/usePushRule';
import {
  type NotificationMode,
  type NotificationModeOptions,
  useNotificationActionsMode,
  useNotificationModeActions,
} from '$hooks/useNotificationMode';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import { notificationModeSelectorOptions } from './notificationModeOptions';

export type NotificationModeSwitcherProps = {
  ruleId: RuleId;
  pushRules: IPushRules;
  defaultPushRuleData: PushRuleData;
  modeOptions?: NotificationModeOptions;
};

export function NotificationModeSwitcher({
  ruleId,
  pushRules,
  defaultPushRuleData,
  modeOptions,
}: NotificationModeSwitcherProps) {
  const mx = useMatrixClient();
  const { kind, pushRule } = usePushRule(pushRules, ruleId) ?? defaultPushRuleData;
  const getModeActions = useNotificationModeActions(modeOptions);
  const selectedMode = useNotificationActionsMode(pushRule.actions);
  const [changeState, change] = useAsyncCallback(
    useCallback(
      async (mode: NotificationMode) => {
        const actions = getModeActions(mode);
        await mx.setPushRuleActions('global', kind, ruleId, actions);
      },
      [mx, getModeActions, kind, ruleId]
    )
  );

  return (
    <SettingMenuSelector
      value={selectedMode}
      options={notificationModeSelectorOptions}
      onSelect={change}
      loading={changeState.status === AsyncStatus.Loading}
    />
  );
}
