import type { RoomMessageEventContent } from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';

export const SHRUG = String.raw`¯\_(ツ)_/¯`;
export const TABLEFLIP = '(╯°□°)╯︵ ┻━┻';
export const UNFLIP = '┬─┬ノ( º_ºノ)';

export const createFunCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room } = ctx;
  return {
    [Command.Me]: {
      name: Command.Me,
      description: 'Send action message',
      exe: async () => undefined,
    },
    [Command.Notice]: {
      name: Command.Notice,
      description: 'Send notice message',
      exe: async () => undefined,
    },
    [Command.Shrug]: {
      name: Command.Shrug,
      description: String.raw`Send ¯\_(ツ)_/¯ as message`,
      exe: async () => undefined,
    },
    [Command.TableFlip]: {
      name: Command.TableFlip,
      description: `Send ${TABLEFLIP} as message`,
      exe: async () => undefined,
    },
    [Command.UnFlip]: {
      name: Command.UnFlip,
      description: `Send ${UNFLIP} as message`,
      exe: async () => undefined,
    },
    [Command.Hug]: {
      name: Command.Hug,
      description: 'Send a hug to someone. Example: /hug [@user:example.org]',
      exe: async (payload) => {
        const target = payload.trim();
        await mx.sendMessage(room.roomId, {
          msgtype: 'im.fluffychat.cute_event',
          'm.mentions': {
            user_ids: target ? [target] : [],
          },
          cute_type: 'hug',
          body: `🤗`,
        } as unknown as RoomMessageEventContent);
      },
    },
    [Command.Cuddle]: {
      name: Command.Cuddle,
      description: 'Send a cuddle to someone. Example: /cuddle [@user:example.org]',
      exe: async (payload) => {
        const target = payload.trim();
        await mx.sendMessage(room.roomId, {
          msgtype: 'im.fluffychat.cute_event',
          cute_type: 'cuddle',
          'm.mentions': {
            user_ids: target ? [target] : [],
          },
          body: `😊`,
        } as unknown as RoomMessageEventContent);
      },
    },
    [Command.Wave]: {
      name: Command.Wave,
      description: 'Send a wave to someone. Example: /wave [@user:example.org]',
      exe: async (payload) => {
        const target = payload.trim();
        await mx.sendMessage(room.roomId, {
          msgtype: 'im.fluffychat.cute_event',
          cute_type: 'wave',
          'm.mentions': {
            user_ids: target ? [target] : [],
          },
          body: `👋`,
        } as unknown as RoomMessageEventContent);
      },
    },
    [Command.Poke]: {
      name: Command.Poke,
      description: 'Send a poke to someone. Example: /poke [@user:example.org]',
      exe: async (payload) => {
        const target = payload.trim();
        await mx.sendMessage(room.roomId, {
          msgtype: 'im.fluffychat.cute_event',
          cute_type: 'poke',
          'm.mentions': {
            user_ids: target ? [target] : [],
          },
          body: `🫵`,
        } as unknown as RoomMessageEventContent);
      },
    },
    [Command.Headpat]: {
      name: Command.Headpat,
      description: 'Send a headpat to someone. Example: /headpat [@user:example.org]',
      // not really like any of the other cute events, but it was too good not to include
      // using a custom msgtype to avoid confusion with the other existing cute events
      exe: async (payload) => {
        const target = payload.trim();
        await mx.sendMessage(room.roomId, {
          msgtype: MsgType.Emote,
          'm.mentions': {
            user_ids: target ? [target] : [],
          },
          body: `pats ${target || 'you'}`,
          'fyi.cisnt.headpat': true,
        } as unknown as RoomMessageEventContent);
      },
    },
  };
};
