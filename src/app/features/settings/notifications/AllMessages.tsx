import { useCallback, useMemo } from 'react';
import { Badge, Box, Text } from 'folds';
import {
  ConditionKind,
  IPushRules,
  PushRuleCondition,
  PushRuleKind,
  RuleId,
} from '$types/matrix-sdk';
import { useAccountData } from '$hooks/useAccountData';
import { AccountDataEvent } from '$types/matrix/accountData';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { PushRuleData, usePushRule } from '$hooks/usePushRule';
import {
  getNotificationModeActions,
  NotificationMode,
  useNotificationModeActions,
} from '$hooks/useNotificationMode';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { NotificationModeSwitcher } from './NotificationModeSwitcher';
import { NotificationLevelsHint } from './NotificationLevelsHint';

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

  const handleChange = useCallback(
    async (mode: NotificationMode) => {
      const actions = getModeActions(mode);
      await mx.setPushRuleActions('global', kind, ruleId, actions);
    },
    [mx, getModeActions, kind, ruleId]
  );

  return <NotificationModeSwitcher pushRule={pushRule} onChange={handleChange} />;
}

export function AllMessagesNotifications() {
  const pushRulesEvt = useAccountData(AccountDataEvent.PushRules);
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
          title="1-to-1 Chats"
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
          title="1-to-1 Chats (Encrypted)"
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
