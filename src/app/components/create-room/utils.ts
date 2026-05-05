import type {
  ICreateRoomOpts,
  ICreateRoomStateEvent,
  MatrixClient,
  Room,
  RoomJoinRulesEventContent,
} from '$types/matrix-sdk';
import { JoinRule, RestrictedAllowType, EventType, RoomType } from '$types/matrix-sdk';

import type { StateEvents } from '$types/matrix-sdk';
import { getViaServers } from '$plugins/via-servers';
import { getMxIdServer } from '$utils/mxIdHelper';
import { CreateRoomAccess } from './types';
import * as prefix from '$unstable/prefixes';

export const createRoomCreationContent = (
  type: RoomType | undefined,
  allowFederation: boolean,
  additionalCreators: string[] | undefined
): object => {
  const content: Record<string, unknown> = {};
  if (typeof type === 'string') {
    content.type = type;
  }
  if (!allowFederation) {
    content['m.federate'] = false;
  }
  if (Array.isArray(additionalCreators)) {
    content.additional_creators = additionalCreators;
  }

  return content;
};

export const createRoomJoinRulesState = (
  access: CreateRoomAccess,
  parent: Room | undefined,
  knock: boolean
) => {
  let content: RoomJoinRulesEventContent = {
    join_rule: knock ? JoinRule.Knock : JoinRule.Invite,
  };

  if (access === CreateRoomAccess.Public) {
    content = {
      join_rule: JoinRule.Public,
    };
  }

  if (access === CreateRoomAccess.Restricted && parent) {
    content = {
      join_rule: knock ? ('knock_restricted' as JoinRule) : JoinRule.Restricted,
      allow: [
        {
          type: RestrictedAllowType.RoomMembership,
          room_id: parent.roomId,
        },
      ],
    };
  }

  return {
    type: EventType.RoomJoinRules,
    state_key: '',
    content,
  };
};

export const createRoomParentState = (parent: Room) => ({
  type: EventType.SpaceParent,
  state_key: parent.roomId,
  content: {
    canonical: true,
    via: getViaServers(parent),
  },
});

const createSpacePowerLevelsOverride = () => ({
  events_default: 50,
});

export const createRoomEncryptionState = () => ({
  type: 'm.room.encryption',
  state_key: '',
  content: {
    algorithm: 'm.megolm.v1.aes-sha2',
  },
});

export const createRoomCallState = () => ({
  type: prefix.MATRIX_UNSTABLE_ROOM_TYPE_CALL_PROPERTY_NAME,
  state_key: '',
  content: {},
});

export const createVoiceRoomPowerLevelsOverride = () => ({
  events: {
    [EventType.GroupCallMemberPrefix]: 0,
  },
});

export type CreateRoomData = {
  version: string;
  type?: RoomType;
  parent?: Room;
  access: CreateRoomAccess;
  name: string;
  topic?: string;
  aliasLocalPart?: string;
  encryption?: boolean;
  knock: boolean;
  allowFederation: boolean;
  additionalCreators?: string[];
};
export const createRoom = async (mx: MatrixClient, data: CreateRoomData): Promise<string> => {
  const initialState: ICreateRoomStateEvent[] = [];

  if (data.encryption) {
    initialState.push(createRoomEncryptionState());
  }

  if (data.parent) {
    initialState.push(createRoomParentState(data.parent));
  }

  if (data.type === RoomType.UnstableCall) {
    initialState.push(createRoomCallState());
  }

  initialState.push(createRoomJoinRulesState(data.access, data.parent, data.knock));

  const options: ICreateRoomOpts = {
    room_version: data.version,
    name: data.name,
    topic: data.topic,
    room_alias_name: data.aliasLocalPart,
    creation_content: createRoomCreationContent(
      data.type,
      data.allowFederation,
      data.additionalCreators
    ),
    power_level_content_override:
      data.type === RoomType.UnstableCall ? createVoiceRoomPowerLevelsOverride() : undefined,
    initial_state: initialState,
  };

  if (data.type === RoomType.Space) {
    options.power_level_content_override = createSpacePowerLevelsOverride();
  }

  const result = await mx.createRoom(options);

  if (data.parent) {
    await mx.sendStateEvent(
      data.parent.roomId,
      EventType.SpaceChild as keyof StateEvents,
      {
        auto_join: false,
        suggested: false,
        via: [getMxIdServer(mx.getUserId() ?? '') ?? ''],
      } as StateEvents[keyof StateEvents],
      result.room_id
    );
  }

  return result.room_id;
};
