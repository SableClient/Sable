import { useCallback, useMemo } from 'react';
import { Badge, Box, Text } from 'folds';
import type { IPushRules, PushRuleCondition } from '$types/matrix-sdk';
import { ConditionKind, PushRuleKind, RuleId, EventType } from '$types/matrix-sdk';
import { useAccountData } from '$hooks/useAccountData';

import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import type { PushRuleData } from '$hooks/usePushRule';
import { usePushRule } from '$hooks/usePushRule';
import {
  getNotificationModeActions,
  NotificationMode,
  useNotificationActionsMode,
  useNotificationModeActions,
} from '$hooks/useNotificationMode';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { NotificationLevelsHint } from './NotificationLevelsHint';
import { notificationModeSelectorOptions } from './notificationModeOptions';

const getAllMessageDefaultRule = (
  ruleId: RuleId,
  encrypted: boolean,
  oneToOne: boolean
): PushRuleData => {
  const conditions: PushRuleCondition[] = [];
  if (oneToOne)
    conditions.push({
      kind: ConditionKind.RoomMemberCount,
      is: '2',
    });
  conditions.push({
    kind: ConditionKind.EventMatch,
    key: 'type',
    pattern: encrypted ? 'm.room.encrypted' : 'm.room.message',
  });

  return {
    kind: PushRuleKind.Underride,
    pushRule: {
      rule_id: ruleId,
      default: true,
      enabled: true,
      conditions,
      actions: getNotificationModeActions(NotificationMode.NotifyLoud),
    },
  };
};

type PushRulesProps = {
  ruleId: RuleId.DM | RuleId.EncryptedDM | RuleId.Message | RuleId.EncryptedMessage;
  pushRules: IPushRules;
  encrypted?: boolean;
  oneToOne?: boolean;
};
function AllMessagesModeSwitcher({
  ruleId,
  pushRules,
  encrypted = false,
  oneToOne = false,
}: PushRulesProps) {
  const mx = useMatrixClient();
  const defaultPushRuleData = getAllMessageDefaultRule(ruleId, encrypted, oneToOne);
  const { kind, pushRule } = usePushRule(pushRules, ruleId) ?? defaultPushRuleData;
  const getModeActions = useNotificationModeActions();
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

export function AllMessagesNotifications() {
  const pushRulesEvt = useAccountData(EventType.PushRules);
  const pushRules = useMemo(
    () => pushRulesEvt?.getContent<IPushRules>() ?? { global: {} },
    [pushRulesEvt]
  );

  return (
    <Box direction="Column" gap="100">
      <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
        <Text size="L400">All Messages</Text>
        <Box gap="100" alignItems="Center">
          <NotificationLevelsHint />
          <Text size="T200">Badge: </Text>
          <Badge radii="300" variant="Secondary" fill="Solid">
            <Text size="L400">1</Text>
          </Badge>
        </Box>
      </Box>
      <Text size="T300" priority="300">
        Default notification level for all messages in rooms where no per-room override is set.
      </Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Direct Messages"
          focusId="direct-messages"
          description="Includes 1-to-1, group DMs, and bridged conversations."
          after={<AllMessagesModeSwitcher pushRules={pushRules} ruleId={RuleId.DM} oneToOne />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Direct Messages (Encrypted)"
          focusId="direct-messages-encrypted"
          description="Includes 1-to-1, group DMs, and bridged conversations."
          after={
            <AllMessagesModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.EncryptedDM}
              encrypted
              oneToOne
            />
          }
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Rooms"
          focusId="rooms"
          after={<AllMessagesModeSwitcher pushRules={pushRules} ruleId={RuleId.Message} />}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Rooms (Encrypted)"
          focusId="rooms-encrypted"
          after={
            <AllMessagesModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.EncryptedMessage}
              encrypted
            />
          }
        />
      </SequenceCard>
    </Box>
  );
}
