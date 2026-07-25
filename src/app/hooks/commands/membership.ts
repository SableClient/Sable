import { Preset, Visibility } from '$types/matrix-sdk';
import {
  addRoomIdToMDirect,
  getDMRoomFor,
  guessDmRoomUserId,
  isRoomAlias,
  isRoomId,
  isUserId,
  removeRoomIdFromMDirect,
} from '$utils/matrix';
import { createRoomEncryptionState } from '$components/create-room';
import { splitWithSpace } from '$utils/common';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';

export const createMembershipCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room, navigateRoom } = ctx;
  return {
    [Command.StartDm]: {
      name: Command.StartDm,
      description: 'Start direct message with user. Example: /startdm userId1',
      exe: async (payload) => {
        const rawIds = splitWithSpace(payload);
        const userIds = rawIds.filter((id) => isUserId(id) && id !== mx.getSafeUserId());
        if (userIds.length === 0) return;
        if (userIds.length === 1) {
          const dmRoomId = getDMRoomFor(mx, userIds[0]!)?.roomId;
          if (dmRoomId) {
            navigateRoom(dmRoomId);
            return;
          }
        }
        const result = await mx.createRoom({
          is_direct: true,
          invite: userIds,
          visibility: Visibility.Private,
          preset: Preset.TrustedPrivateChat,
          initial_state: [createRoomEncryptionState()],
        });
        addRoomIdToMDirect(mx, result.room_id, userIds[0]!);
        navigateRoom(result.room_id);
      },
    },
    [Command.Join]: {
      name: Command.Join,
      description: 'Join room with address. Example: /join address1 address2',
      exe: async (payload) => {
        const rawIds = splitWithSpace(payload);
        const roomIdOrAliases = rawIds.filter(
          (idOrAlias) => isRoomId(idOrAlias) || isRoomAlias(idOrAlias)
        );
        roomIdOrAliases.forEach(async (idOrAlias) => {
          await mx.joinRoom(idOrAlias);
        });
      },
    },
    [Command.Leave]: {
      name: Command.Leave,
      description: 'Leave current room.',
      exe: async (payload) => {
        if (payload.trim() === '') {
          mx.leave(room.roomId);
          return;
        }
        const rawIds = splitWithSpace(payload);
        const roomIds = rawIds.filter((id) => isRoomId(id));
        roomIds.map((id) => mx.leave(id));
      },
    },
    [Command.ConvertToDm]: {
      name: Command.ConvertToDm,
      description: 'Convert room to direct message',
      exe: async () => {
        const dmUserId = guessDmRoomUserId(room, mx.getSafeUserId());
        await addRoomIdToMDirect(mx, room.roomId, dmUserId);
      },
    },
    [Command.ConvertToRoom]: {
      name: Command.ConvertToRoom,
      description: 'Convert direct message to room',
      exe: async () => {
        await removeRoomIdFromMDirect(mx, room.roomId);
      },
    },
    [Command.Knock]: {
      name: Command.Knock,
      description:
        'Knock on (request to join) room with address. Example: /knock address1 address2',
      exe: async (payload) => {
        const rawIds = splitWithSpace(payload);
        const roomIdOrAliases = rawIds.filter(
          (idOrAlias) => isRoomId(idOrAlias) || isRoomAlias(idOrAlias)
        );
        roomIdOrAliases.forEach(async (idOrAlias) => {
          await mx.knockRoom(idOrAlias);
        });
      },
    },
  };
};
