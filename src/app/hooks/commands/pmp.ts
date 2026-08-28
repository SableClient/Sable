import { splitWithSpace } from '$utils/common';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import type { PerMessageProfileMsc4461 } from '../usePerMessageProfile';
import {
  addOrUpdatePerMessageProfile,
  deletePerMessageProfile,
  setCurrentlyUsedPerMessageProfileIdForRoom,
} from '../usePerMessageProfile';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';

const ADDPMP_REGEX = /(\S+) (name=)?"?([\w\s]*)"? (avatar=)?([\w.:/]+)/;
const USEPMP_REGEX = /^(\S+)\s*(-g)?(-o)?(-u)?\s*(\d+)?$/;

export const createPmpCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room, pkitcmdHandler } = ctx;
  return {
    [Command.AddPerMessageProfileToAccount]: {
      name: Command.AddPerMessageProfileToAccount,
      description:
        'Add or update a per message profile to your account. Example: /addpmp profileId name=Profile Name avatar=mxc://xyzabc',
      exe: async (payload) => {
        // Parse key=value pairs
        const args = ADDPMP_REGEX.exec(payload);
        if (!args) {
          sendFeedback(`invalid payload`, room, mx.getSafeUserId());
          return;
        }
        const avatar_url: string | undefined = args[5];
        const name: string | undefined = args[3];
        const profileId = args[1];

        if (!avatar_url || !name || !profileId) {
          sendFeedback(`invalid payload`, room, mx.getSafeUserId());
          return;
        }

        const pmp: PerMessageProfileMsc4461 = {
          id: profileId,
          displayname: name || '',
          avatar_url,
        };
        await addOrUpdatePerMessageProfile(mx, pmp)
          .then(() => {
            sendFeedback(
              `Per message profile "${profileId}" added/updated in account.`,
              room,
              mx.getSafeUserId()
            );
          })
          .catch(() => {
            sendFeedback(
              `Failed to add/update per message profile "${profileId}" in account.`,
              room,
              mx.getSafeUserId()
            );
          });
      },
    },
    [Command.DeletePerMessageProfileFromAccount]: {
      name: Command.DeletePerMessageProfileFromAccount,
      description: 'Delete a per message profile from your account. Example: /delpmp profileId',
      exe: async (payload) => {
        const [profileId] = splitWithSpace(payload);
        if (profileId === 'index') {
          // "index" is reserved for the profile index, reject it as a profile id
          sendFeedback('Cannot delete reserved profile ID "index".', room, mx.getSafeUserId());
          return;
        }
        await deletePerMessageProfile(mx, profileId ?? '')
          .then(() => {
            sendFeedback(
              `Per message profile "${profileId}" deleted from account.`,
              room,
              mx.getSafeUserId()
            );
          })
          .catch(() => {
            sendFeedback(
              `Failed to delete per message profile "${profileId}" from account.`,
              room,
              mx.getSafeUserId()
            );
          });
      },
    },
    [Command.UsePerMessageProfile]: {
      name: Command.UsePerMessageProfile,
      description:
        'Use a per message profile for this room once, or until reset. Example: /usepmp (profileId,reset) [-o,-u,-g] [ts]',
      exe: async (payload) => {
        const args = USEPMP_REGEX.exec(payload);
        if (!args) {
          sendFeedback(`invalid payload`, room, mx.getSafeUserId());
          return;
        }
        const profileId = args[1];
        const globalFlag = args[2] !== undefined;
        const onceFlag = args[3] !== undefined;
        // const untilFlag = args[4] !== undefined;
        const validUntil = Number.parseInt(args[5] ?? '', 10);
        if (onceFlag || globalFlag) {
          sendFeedback(
            'Currently not implemented, consider using shorthands, with /pmpproxy id ✨:text',
            room,
            mx.getSafeUserId()
          );
          return;
        }

        if ((profileId ?? '').normalize() === 'reset') {
          setCurrentlyUsedPerMessageProfileIdForRoom(mx, room.roomId, undefined, undefined, true)
            .then(() => {
              sendFeedback('Per message profile reset for this room.', room, mx.getSafeUserId());
            })
            .catch((e) => {
              sendFeedback(
                `Failed to reset per message profile for this room. Failed with: "${(e as Error).message}"`,
                room,
                mx.getSafeUserId()
              );
            });
          return;
        }
        await setCurrentlyUsedPerMessageProfileIdForRoom(mx, room.roomId, profileId, validUntil)
          .then(() => {
            sendFeedback(
              `Per message profile "${profileId}" will be used for messages in this room for the until ${
                validUntil ?? 'reset'
              }. Use \`/usepmp reset\` to reset it at any time.`,
              room,
              mx.getSafeUserId()
            );
          })
          .catch((e) => {
            sendFeedback(
              `Failed to set per message profile for this room. Failed with: "${(e as Error).message}"`,
              room,
              mx.getSafeUserId()
            );
          });
      },
    },
    [Command.AssociateProxyPerMessageProfile]: {
      name: Command.AssociateProxyPerMessageProfile,
      description: 'Associate proxy with a profile. Example /pmpproxy id ✨:text',
      exe: async (payload) => {
        const pid: string = splitWithSpace(payload)[0] ?? '';
        const proxy: string = splitWithSpace(payload)[1] ?? '';
        await pkitcmdHandler.handleMessage(`pk;member "${pid}" proxy ${proxy}`, true);
      },
    },
  };
};
