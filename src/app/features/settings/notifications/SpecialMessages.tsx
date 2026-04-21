import { useCallback, useMemo } from 'react';
import type { IPushRules } from '$types/matrix-sdk';
import { ConditionKind, PushRuleKind, RuleId, EventType } from '$types/matrix-sdk';
import { Box, Text, Badge } from 'folds';
import { useAccountData } from '$hooks/useAccountData';

import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { SettingMenuSelector } from '$components/setting-menu-selector';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useUserProfile } from '$hooks/useUserProfile';
import { getMxIdLocalPart } from '$utils/matrix';
import type { PushRuleData } from '$hooks/usePushRule';
import { makePushRuleData, usePushRule } from '$hooks/usePushRule';
import type { NotificationModeOptions } from '$hooks/useNotificationMode';
import {
  getNotificationModeActions,
  NotificationMode,
  useNotificationActionsMode,
  useNotificationModeActions,
} from '$hooks/useNotificationMode';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { NotificationLevelsHint } from './NotificationLevelsHint';
import { notificationModeSelectorOptions } from './notificationModeOptions';

const NOTIFY_MODE_OPS: NotificationModeOptions = {
  highlight: true,
};
const getDefaultIsUserMention = (userId: string): PushRuleData =>
  makePushRuleData(
    PushRuleKind.Override,
    RuleId.IsUserMention,
    getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
    [
      {
        kind: ConditionKind.EventPropertyContains,
        key: 'content.m\\.mentions.user_ids',
        value: userId,
      },
    ]
  );

const DefaultContainsDisplayName = makePushRuleData(
  PushRuleKind.Override,
  RuleId.ContainsDisplayName,
  getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
  [
    {
      kind: ConditionKind.ContainsDisplayName,
    },
  ]
);

const getDefaultContainsUsername = (username: string) =>
  makePushRuleData(
    PushRuleKind.ContentSpecific,
    RuleId.ContainsUserName,
    getNotificationModeActions(NotificationMode.NotifyLoud, { highlight: true }),
    undefined,
    username
  );

const DefaultIsRoomMention = makePushRuleData(
  PushRuleKind.Override,
  RuleId.IsRoomMention,
  getNotificationModeActions(NotificationMode.Notify, { highlight: true }),
  [
    {
      kind: ConditionKind.EventPropertyIs,
      key: 'content.m\\.mentions.room',
      value: true,
    },
    {
      kind: ConditionKind.SenderNotificationPermission,
      key: 'room',
    },
  ]
);

const DefaultAtRoomNotification = makePushRuleData(
  PushRuleKind.Override,
  RuleId.AtRoomNotification,
  getNotificationModeActions(NotificationMode.Notify, { highlight: true }),
  [
    {
      kind: ConditionKind.EventMatch,
      key: 'content.body',
      pattern: '@room',
    },
    {
      kind: ConditionKind.SenderNotificationPermission,
      key: 'room',
    },
  ]
);

type PushRulesProps = {
  ruleId: RuleId;
  pushRules: IPushRules;
  defaultPushRuleData: PushRuleData;
};
function MentionModeSwitcher({ ruleId, pushRules, defaultPushRuleData }: PushRulesProps) {
  const mx = useMatrixClient();

  const { kind, pushRule } = usePushRule(pushRules, ruleId) ?? defaultPushRuleData;
  const getModeActions = useNotificationModeActions(NOTIFY_MODE_OPS);
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

export function SpecialMessagesNotifications() {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const { displayName } = useUserProfile(userId);
  const pushRulesEvt = useAccountData(EventType.PushRules);
  const pushRules = useMemo(
    () => pushRulesEvt?.getContent<IPushRules>() ?? { global: {} },
    [pushRulesEvt]
  );
  const intentionalMentions = mx.supportsIntentionalMentions();

  return (
    <Box direction="Column" gap="100">
      <Box alignItems="Center" justifyContent="SpaceBetween" gap="200">
        <Text size="L400">Special Messages</Text>
        <Box gap="100" alignItems="Center">
          <NotificationLevelsHint />
          <Text size="T200">Badge: </Text>
          <Badge radii="300" variant="Success" fill="Solid">
            <Text size="L400">1</Text>
          </Badge>
        </Box>
      </Box>
      <Text size="T300" priority="300">
        Overrides the All Messages level for messages that mention you or match a keyword.
      </Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title={`Mention User ID ("${userId}")`}
          focusId="mention-user-id"
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.IsUserMention}
              defaultPushRuleData={getDefaultIsUserMention(userId)}
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
          title={`Contains Displayname ${displayName ? `("${displayName}")` : ''}`}
          focusId="contains-display-name"
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.ContainsDisplayName}
              defaultPushRuleData={DefaultContainsDisplayName}
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
          title={`Contains Username ("${getMxIdLocalPart(userId)}")`}
          focusId="contains-username"
          after={
            <MentionModeSwitcher
              pushRules={pushRules}
              ruleId={RuleId.ContainsUserName}
              defaultPushRuleData={getDefaultContainsUsername(getMxIdLocalPart(userId) ?? userId)}
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
          title="Mention @room"
          focusId="mention-room"
          description="Only triggers if the sender has permission to notify the whole room."
          after={
            intentionalMentions ? (
              <MentionModeSwitcher
                pushRules={pushRules}
                ruleId={RuleId.IsRoomMention}
                defaultPushRuleData={DefaultIsRoomMention}
              />
            ) : (
              <MentionModeSwitcher
                pushRules={pushRules}
                ruleId={RuleId.AtRoomNotification}
                defaultPushRuleData={DefaultAtRoomNotification}
              />
            )
          }
        />
      </SequenceCard>
    </Box>
  );
}
