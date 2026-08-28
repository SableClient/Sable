import { EventTimeline, EventType, MatrixError } from '$types/matrix-sdk';
import { setOwnRoomMemberProfile } from '$utils/roomMemberProfile';
import { parsePronounsInput } from '$utils/pronouns';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import { CustomStateEvent } from '$types/matrix/room';
import { ErrorCode } from '../../cs-errorcode';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';
import { isValidHex } from '$hooks/useUserProfile';
import * as prefix from '$unstable/prefixes';
import type { CustomRoomMemberEventContent } from '$unstable/CustomRoomMemberEventContent';

export const createProfileCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room, profileDisplayName } = ctx;
  return {
    [Command.MyRoomNick]: {
      name: Command.MyRoomNick,
      description: 'Change nick in current room.',
      exe: async (payload) => {
        let nick: string | null = payload.trim();
        if (nick === '') nick = profileDisplayName ?? null;
        const mEvent = room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(EventType.RoomMember, mx.getSafeUserId());
        const content = mEvent?.getContent<CustomRoomMemberEventContent>();
        if (!content) return;
        const updatedContent: CustomRoomMemberEventContent = { ...content };
        const withDisplay = updatedContent as CustomRoomMemberEventContent & {
          displayname?: string;
        };
        if (nick == null || nick === '') {
          delete withDisplay.displayname;
        } else {
          withDisplay.displayname = nick;
        }
        await setOwnRoomMemberProfile(mx, room, updatedContent);
      },
    },
    [Command.MyRoomAvatar]: {
      name: Command.MyRoomAvatar,
      description: 'Change profile picture in current room. Example /myroomavatar mxc://xyzabc',
      exe: async (payload) => {
        const trimmed = payload.trim();
        const isRemove = trimmed.length === 0;
        const mEvent = room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(EventType.RoomMember, mx.getSafeUserId());
        const content = mEvent?.getContent<CustomRoomMemberEventContent>();
        if (!content) return;
        const updatedContent: CustomRoomMemberEventContent = { ...content };
        if (isRemove) {
          // Reset to global avatar
          const globalAvatar = mx.getUser(mx.getSafeUserId())?.avatarUrl ?? undefined;
          (updatedContent as CustomRoomMemberEventContent & { avatar_url?: string }).avatar_url =
            globalAvatar;
        } else {
          if (!trimmed.match(/^mxc:\/\/\S+$/)) {
            // bad mxc
            return;
          }
          (updatedContent as CustomRoomMemberEventContent & { avatar_url?: string }).avatar_url =
            trimmed;
        }
        await setOwnRoomMemberProfile(mx, room, updatedContent);
      },
    },
    [Command.Color]: {
      name: Command.Color,
      description: 'Set a room-specific color. Example: /color light #ff00ff | /color reset',
      exe: async (payload) => {
        const input = payload.trim().toLowerCase().split(' ');
        const userId = mx.getSafeUserId();
        const completeClear = input.length >= 0 && (input[0] === 'reset' || input[0] === 'clear');
        const isLight =
          input.length === 2 &&
          (input[0] === 'light' || input[0] === 'on_light' || input[0] === 'both');
        const isDark =
          input.length === 2 &&
          (input[0] === 'dark' || input[0] === 'on_dark' || input[0] === 'both');
        const color =
          input[1] === 'reset' || input[1] === 'clear'
            ? undefined
            : input[1]?.length
              ? input[1]
              : '';

        try {
          if (!color || isValidHex(color) || completeClear) {
            const mEvent = room
              .getLiveTimeline()
              .getState(EventTimeline.FORWARDS)
              ?.getStateEvents(EventType.RoomMember, mx.getSafeUserId());
            const content = mEvent?.getContent<CustomRoomMemberEventContent>();
            if (!content) return;
            const updatedContent: CustomRoomMemberEventContent = { ...content };
            if (completeClear) {
              // Reset
              updatedContent[prefix.MATRIX_UNSTABLE_COLORS] = undefined;

              await mx.sendStateEvent(room.roomId, CustomStateEvent.RoomCosmeticsColor, {}, userId);
            } else {
              if (color && !isValidHex(color)) {
                return;
              }
              updatedContent[prefix.MATRIX_UNSTABLE_COLORS] = {
                on_dark: isDark ? color : content[prefix.MATRIX_UNSTABLE_COLORS]?.on_dark,
                on_light: isLight ? color : content[prefix.MATRIX_UNSTABLE_COLORS]?.on_light,
              };
            }
            await setOwnRoomMemberProfile(mx, room, updatedContent);
            sendFeedback(
              `Room color set to:\nOver dark themes ${updatedContent[prefix.MATRIX_UNSTABLE_COLORS]?.on_dark},\nOver light themes ${updatedContent[prefix.MATRIX_UNSTABLE_COLORS]?.on_light}.`,
              room,
              userId
            );
            await mx.sendStateEvent(room.roomId, CustomStateEvent.RoomCosmeticsColor, {}, userId);
          } else {
            sendFeedback(
              'Invalid format. Use #RRGGBB for colors and specify which color.',
              room,
              userId
            );
          }
        } catch (e: unknown) {
          if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
            sendFeedback('Permission Denied.', room, userId);
          }
        }
      },
    },
    [Command.SColor]: {
      name: Command.SColor,
      description:
        'Set your color for the current Space. Example: /scolor light #ff00ff | /scolor reset',
      exe: async (payload) => {
        const input = payload.trim().toLowerCase().split(' ');
        const userId = mx.getSafeUserId();

        const parents = room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(EventType.SpaceParent);

        const targetSpaceId =
          parents && parents.length > 0 ? parents[0]!.getStateKey() : room.roomId;
        const targetRoom = mx.getRoom(targetSpaceId);
        const completeClear = input.length >= 0 && (input[0] === 'reset' || input[0] === 'clear');
        const isLight =
          input.length === 2 &&
          (input[0] === 'light' || input[0] === 'on_light' || input[0] === 'both');
        const isDark =
          input.length === 2 &&
          (input[0] === 'dark' || input[0] === 'on_dark' || input[0] === 'both');
        const color =
          input[1] === 'reset' || input[1] === 'clear'
            ? undefined
            : input[1]?.length
              ? input[1]
              : '';

        try {
          if (!color || isValidHex(color) || completeClear) {
            const mEvent = room
              .getLiveTimeline()
              .getState(EventTimeline.FORWARDS)
              ?.getStateEvents(EventType.RoomMember, mx.getSafeUserId());
            const content = mEvent?.getContent<CustomRoomMemberEventContent>();
            if (!content) return;
            const updatedContent: CustomRoomMemberEventContent = { ...content };
            if (completeClear) {
              // Reset
              updatedContent[prefix.MATRIX_UNSTABLE_COLORS] = undefined;
              //This may be ignored since it is to delete the old key when updated
              try {
                await mx.sendStateEvent(
                  room.roomId,
                  CustomStateEvent.RoomCosmeticsColor,
                  {},
                  userId
                );
              } catch {}
            } else {
              if (color && !isValidHex(color)) {
                return;
              }
              updatedContent[prefix.MATRIX_UNSTABLE_COLORS] = {
                on_dark: isDark ? color : content[prefix.MATRIX_UNSTABLE_COLORS]?.on_dark,
                on_light: isLight ? color : content[prefix.MATRIX_UNSTABLE_COLORS]?.on_light,
              };
            }
            if (targetRoom) {
              await setOwnRoomMemberProfile(mx, targetRoom, updatedContent);
              sendFeedback(
                `Room color set to:\nOver dark themes ${updatedContent[prefix.MATRIX_UNSTABLE_COLORS]?.on_dark},\nOver light themes ${updatedContent[prefix.MATRIX_UNSTABLE_COLORS]?.on_light}.`,
                room,
                userId
              );
              try {
                await mx.sendStateEvent(
                  room.roomId,
                  CustomStateEvent.RoomCosmeticsColor,
                  {},
                  userId
                );
              } catch {}
            }
          } else {
            sendFeedback(
              'Invalid format. Use #RRGGBB for colors and specify which color (on_light|on_dark).',
              room,
              userId
            );
          }
        } catch (e: unknown) {
          if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
            sendFeedback('Permission Denied.', room, userId);
          }
        }
      },
    },
    [Command.Font]: {
      name: Command.Font,
      description: 'Set a room-specific font. Example: /font Courier New | /font reset',
      exe: async (payload) => {
        const input = payload
          .trim()
          .replaceAll(/[;{}<>]/g, '')
          .slice(0, 32);
        const userId = mx.getSafeUserId();

        try {
          if (input.toLowerCase() === 'reset' || input === '') {
            await mx.sendStateEvent(room.roomId, CustomStateEvent.RoomCosmeticsFont, {}, userId);
            sendFeedback('Room font reset.', room, userId);
            return;
          }

          await mx.sendStateEvent(
            room.roomId,
            CustomStateEvent.RoomCosmeticsFont,
            { font: input },
            userId
          );
          sendFeedback(`Room font set to "${input}".`, room, userId);
        } catch (e: unknown) {
          if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
            sendFeedback(
              'Permission Denied. An admin must enable "Room Fonts" in Settings > Cosmetics in app.sable.moe or another supported client.',
              room,
              userId
            );
          }
        }
      },
    },
    [Command.SFont]: {
      name: Command.SFont,
      description: 'Set a font for the current Space. Example: /sfont Courier New | /sfont reset',
      exe: async (payload) => {
        const input = payload
          .trim()
          .replaceAll(/[;{}<>]/g, '')
          .slice(0, 32);
        const userId = mx.getSafeUserId();

        const parents = room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(EventType.SpaceParent);

        const targetSpaceId =
          parents && parents.length > 0 ? parents[0]!.getStateKey() : room.roomId;

        try {
          if (input.toLowerCase() === 'reset' || input === '') {
            await mx.sendStateEvent(
              targetSpaceId as string,
              CustomStateEvent.RoomCosmeticsFont,
              {},
              userId
            );
            sendFeedback('Space font reset.', room, userId);
            return;
          }

          await mx.sendStateEvent(
            targetSpaceId as string,
            CustomStateEvent.RoomCosmeticsFont,
            { font: input },
            userId
          );
          sendFeedback(`Space font set to "${input}".`, room, userId);
        } catch (e: unknown) {
          if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
            sendFeedback(
              'Permission Denied. An admin must enable "Space-Wide Fonts" in Settings > Cosmetics in app.sable.moe or another supported client.',
              room,
              userId
            );
          }
        }
      },
    },
    [Command.Pronoun]: {
      name: Command.Pronoun,
      description:
        'Set your pronouns for this room. Example: /pronoun "en:they/them, de:sie/ihr" | /pronoun reset',
      exe: async (payload) => {
        const match = payload.trim().match(/^"(.*)"$/);
        const rawInput = match ? (match[1] ?? '').trim() : payload.trim();
        const userId = mx.getSafeUserId();

        try {
          if (['reset', 'clear', ''].includes(rawInput.toLowerCase())) {
            await mx.sendStateEvent(
              room.roomId,
              CustomStateEvent.RoomCosmeticsPronouns,
              {},
              userId
            );
            sendFeedback('Room pronouns have been reset.', room, userId);
            return;
          }

          const pronounsArray = parsePronounsInput(rawInput);

          await mx.sendStateEvent(
            room.roomId,
            CustomStateEvent.RoomCosmeticsPronouns,
            { pronouns: pronounsArray },
            userId
          );

          const feedbackString = pronounsArray
            .map((p) => (p.language ? `for ${p.language} "${p.summary}" was set` : p.summary))
            .join(', ');

          sendFeedback(`Room pronouns set: ${feedbackString}`, room, userId);
        } catch (e: unknown) {
          if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
            sendFeedback('Permission Denied. Could not update room pronouns.', room, userId);
          }
        }
      },
    },
    [Command.SPronoun]: {
      name: Command.SPronoun,
      description:
        'Set your pronouns for this space. Example: /spronoun "en:they/them, de:sie/ihr" | /spronoun reset',
      exe: async (payload) => {
        const match = payload.trim().match(/^"(.*)"$/);
        const rawInput = match ? (match[1] ?? '').trim() : payload.trim();
        const userId = mx.getSafeUserId();

        const parents = room
          .getLiveTimeline()
          .getState(EventTimeline.FORWARDS)
          ?.getStateEvents(EventType.SpaceParent);

        const targetSpaceId =
          parents && parents.length > 0 ? parents[0]!.getStateKey() : room.roomId;

        try {
          if (['reset', 'clear', ''].includes(rawInput.toLowerCase())) {
            await mx.sendStateEvent(
              targetSpaceId as string,
              CustomStateEvent.RoomCosmeticsPronouns,
              {},
              userId
            );
            sendFeedback('Global space pronouns reset.', room, userId);
            return;
          }

          const pronounsArray = parsePronounsInput(rawInput);

          await mx.sendStateEvent(
            targetSpaceId as string,
            CustomStateEvent.RoomCosmeticsPronouns,
            { pronouns: pronounsArray },
            userId
          );

          const feedbackString = pronounsArray
            .map((p) => (p.language ? `for ${p.language} "${p.summary}" was set` : p.summary))
            .join(', ');

          sendFeedback(`Global space pronouns set: ${feedbackString}`, room, userId);
        } catch (e: unknown) {
          if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
            sendFeedback('Permission Denied. Could not update space pronouns.', room, userId);
          }
        }
      },
    },
  };
};
