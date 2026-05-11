import type {
  IContextResponse,
  MatrixClient,
  Room,
  RoomMember,
  RoomMemberEventContent,
  RoomMessageEventContent,
  RoomServerAclEventContent,
} from '$types/matrix-sdk';
import {
  Direction,
  EventTimeline,
  EventType,
  Method,
  MatrixError,
  Preset,
  Visibility,
  MsgType,
  KnownMembership,
} from '$types/matrix-sdk';
import { useMemo } from 'react';

import { StateEvent } from '$types/matrix/room';
import {
  addRoomIdToMDirect,
  getDMRoomFor,
  guessDmRoomUserId,
  isRoomAlias,
  isRoomId,
  isServerName,
  isUserId,
  rateLimitedActions,
  removeRoomIdFromMDirect,
} from '$utils/matrix';
import { getStateEvent } from '$utils/room';
import { splitWithSpace } from '$utils/common';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { createRoomEncryptionState } from '$components/create-room';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import { PKitCommandMessageHandler } from '$plugins/pluralkit-handler/PKitCommandMessageHandler';
import { getFromCommandRegistry } from '$plugins/commandHandling/commandRegistry';
import { loadBuildInCommands } from '$plugins/commandHandling/builtin/builtInCommands';
import { useRoomNavigate } from './useRoomNavigate';
import { enrichWidgetUrl } from './useRoomWidgets';
import { useUserProfile } from './useUserProfile';
import type { PerMessageProfile } from './usePerMessageProfile';
import { CustomStateEvent } from '$types/matrix/room';

import {
  addOrUpdatePerMessageProfile,
  deletePerMessageProfile,
  setCurrentlyUsedPerMessageProfileIdForRoom,
} from './usePerMessageProfile';

export const SHRUG = String.raw`¯\_(ツ)_/¯`;
export const TABLEFLIP = '(╯°□°)╯︵ ┻━┻';
export const UNFLIP = '┬─┬ノ( º_ºノ)';

const FLAG_PAT = String.raw`(?:^|\s)-(\w+)\b`;
const FLAG_REG = new RegExp(FLAG_PAT);
const FLAG_REG_G = new RegExp(FLAG_PAT, 'g');

const ADDPMP_REGEX = /(\S+) (name=)?"?([\w\s]*)"? (avatar=)?([\w.:/]+)/;
const USEPMP_REGEX = /^(\S+)\s*(-g)?(-o)?(-u)?\s*(\d+)?$/;

export const splitPayloadContentAndFlags = (payload: string): [string, string | undefined] => {
  const flagMatch = new RegExp(FLAG_REG).exec(payload);

  if (!flagMatch) {
    return [payload, undefined];
  }
  const content = payload.slice(0, flagMatch.index);
  const flags = payload.slice(flagMatch.index);

  return [content, flags];
};

export const parseFlags = (flags: string | undefined): Record<string, string | undefined> => {
  const result: Record<string, string> = {};
  if (!flags) return result;

  const matches: { key: string; index: number; match: string }[] = [];

  for (let match = FLAG_REG_G.exec(flags); match !== null; match = FLAG_REG_G.exec(flags)) {
    if (!match[1] || !match[0]) continue;
    matches.push({ key: match[1], index: match.index, match: match[0] });
  }

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    if (!current) continue;
    const { key, match } = current;
    const start = current.index + match.length;
    const end = i + 1 < matches.length ? (matches[i + 1]?.index ?? flags.length) : flags.length;
    const value = flags.slice(start, end).trim();
    result[key] = value;
  }

  return result;
};

export const parseUsers = (payload: string): string[] => {
  const users: string[] = [];

  splitWithSpace(payload).forEach((item) => {
    if (isUserId(item)) {
      users.push(item);
    }
  });

  return users;
};

export const parseServers = (payload: string): string[] => {
  const servers: string[] = [];

  splitWithSpace(payload).forEach((item) => {
    if (isServerName(item)) {
      servers.push(item);
    }
  });

  return servers;
};

const getServerMembers = (room: Room, server: string): RoomMember[] => {
  const members: RoomMember[] = room
    .getMembers()
    .filter((member) => member.userId.endsWith(`:${server}`));

  return members;
};

export const parseTimestampFlag = (input: string): number | undefined => {
  const match = input.match(/^(\d+(?:\.\d+)?)([dhms])$/); // supports floats like 1.5d

  if (!match) {
    return undefined;
  }

  const value = Number.parseFloat(match[1]!); // supports decimal values
  const unit = match[2];

  const now = Date.now(); // in milliseconds
  let delta = 0;

  switch (unit) {
    case 'd':
      delta = value * 24 * 60 * 60 * 1000;
      break;
    case 'h':
      delta = value * 60 * 60 * 1000;
      break;
    case 'm':
      delta = value * 60 * 1000;
      break;
    case 's':
      delta = value * 1000;
      break;
    default:
      return undefined;
  }

  const timestamp = now - delta;
  return timestamp;
};

const hslToHex = (h: number, s: number, l: number): string => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const getAllTextNodes = (root: Node): Node[] =>
  root.nodeType === Node.TEXT_NODE
    ? [root]
    : Array.from(root.childNodes).reduce<Node[]>(
        (acc, child) => acc.concat(getAllTextNodes(child)),
        []
      );

export const rainbowify = (htmlInput: string): string => {
  const div = document.createElement('div');
  div.innerHTML = htmlInput;
  const textNodes = getAllTextNodes(div);
  const totalTextLen = textNodes.reduce((acc, node) => {
    const text = node.textContent || '';
    const cleanLen = Array.from(text).filter((c) => c.trim().length > 0).length;
    return acc + cleanLen;
  }, 0);

  textNodes.reduce((currentGlobalIdx, node) => {
    const text = node.textContent || '';
    if (!text.trim()) return currentGlobalIdx;

    const chars = Array.from(text);

    const { html: newHtml, count: charsProcessed } = chars.reduce(
      (acc, char) => {
        if (char.trim().length === 0) {
          return { html: acc.html + char, count: acc.count };
        }
        const hue = ((currentGlobalIdx + acc.count) / totalTextLen) * (5 / 6);
        const color = hslToHex(hue, 1.0, 0.5);
        const coloredChar = `<span data-mx-color="${color}">${char}</span>`;
        return { html: acc.html + coloredChar, count: acc.count + 1 };
      },
      { html: '', count: 0 }
    );

    const span = document.createElement('span');
    span.innerHTML = newHtml;
    node.parentNode?.replaceChild(span, node);
    return currentGlobalIdx + charsProcessed;
  }, 0);

  return div.innerHTML;
};

export type CommandExe = (payload: string, html?: string) => Promise<void>;

export enum Command {
  // Cinny commands
  Me = 'me',
  Notice = 'notice',
  Shrug = 'shrug',
  StartDm = 'startdm',
  Join = 'join',
  Leave = 'leave',
  Invite = 'invite',
  DisInvite = 'disinvite',
  Kick = 'kick',
  Ban = 'ban',
  UnBan = 'unban',
  Ignore = 'ignore',
  UnIgnore = 'unignore',
  MyRoomNick = 'myroomnick',
  MyRoomAvatar = 'myroomavatar',
  ConvertToDm = 'converttodm',
  ConvertToRoom = 'converttoroom',
  TableFlip = 'tableflip',
  UnFlip = 'unflip',
  Delete = 'delete',
  Acl = 'acl',
  // Sable commands
  Knock = 'knock',
  Color = 'color',
  SColor = 'scolor',
  Font = 'font',
  SFont = 'sfont',
  AddWidget = 'addwidget',
  AddPerMessageProfileToAccount = 'addpmp',
  DeletePerMessageProfileFromAccount = 'delpmp',
  UsePerMessageProfile = 'usepmp',
  AssociateProxyPerMessageProfile = 'pmpproxy',
  Pronoun = 'pronoun',
  SPronoun = 'spronoun',
  Rainbow = 'rainbow',
  RawMsg = 'rawmsg',
  Raw = 'raw',
  RawAcc = 'rawacc',
  DelAcc = 'delacc',
  SetExt = 'setext',
  DelExt = 'delext',
  DiscardSession = 'discardsession',
  Html = 'html',
  // Cute Events
  Hug = 'hug',
  Cuddle = 'cuddle',
  // our own cute events, not part of FluffyChat or other clients
  Wave = 'wave',
  Poke = 'poke',
  Headpat = 'headpat',
  // Meta
  Report = 'bugreport',
  // Experimental
  ShareE2EEHistory = 'sharehistory',
  // Spec missing from cinny
  Location = 'location',
  ShareMyLocation = 'sharemylocation',
}

export type CommandContent = {
  name: string;
  description: string;
  exe: CommandExe;
};

export type CommandRecord = Record<Command, CommandContent>;

export const useCommands = (mx: MatrixClient, room: Room): CommandRecord => {
  const { navigateRoom } = useRoomNavigate();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');
  const [enableMSC4268CMD] = useSetting(settingsAtom, 'enableMSC4268CMD');
  // helper for pkit commands
  const pkitcmdHandler = useMemo(() => new PKitCommandMessageHandler(mx, room), [mx, room]);
  const profile = useUserProfile(mx.getSafeUserId());

  loadBuildInCommands();

  const commands: CommandRecord = useMemo(
    () => ({
      // Cinny commands
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
        description: getFromCommandRegistry('join').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('join');
          await cmd.execute({ mx, room });
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
      [Command.Invite]: {
        name: Command.Invite,
        description: 'Invite user to room. Example: /invite userId1 userId2 [-r reason]',
        exe: async (payload) => {
          const [content, flags] = splitPayloadContentAndFlags(payload);
          const users = parseUsers(content);
          const flagToContent = parseFlags(flags);
          const reason = flagToContent.r;
          users.map((id) => mx.invite(room.roomId, id, reason));
        },
      },
      [Command.DisInvite]: {
        name: Command.DisInvite,
        description: getFromCommandRegistry('disinvite').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('disinvite');
          await cmd.execute({ mx, room });
        },
      },
      [Command.Kick]: {
        name: Command.Kick,
        description: getFromCommandRegistry('kick').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('kick');
          await cmd.execute({ mx, room });
        },
      },
      [Command.Ban]: {
        name: Command.Ban,
        description: getFromCommandRegistry('ban').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('ban');
          await cmd.execute({ mx, room });
        },
      },
      [Command.UnBan]: {
        name: Command.UnBan,
        description: getFromCommandRegistry('unban').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('unban');
          await cmd.execute({ mx, room });
        },
      },
      [Command.Ignore]: {
        name: Command.Ignore,
        description: 'Ignore user. Example: /ignore userId1 userId2',
        exe: async (payload) => {
          const rawIds = splitWithSpace(payload);
          const userIds = rawIds.filter((id) => isUserId(id));
          if (userIds.length > 0) {
            let ignoredUsers = mx.getIgnoredUsers().concat(userIds);
            ignoredUsers = [...new Set(ignoredUsers)];
            await mx.setIgnoredUsers(ignoredUsers);
          }
        },
      },
      [Command.UnIgnore]: {
        name: Command.UnIgnore,
        description: 'Unignore user. Example: /unignore userId1 userId2',
        exe: async (payload) => {
          const rawIds = splitWithSpace(payload);
          const userIds = rawIds.filter((id) => isUserId(id));
          if (userIds.length > 0) {
            const ignoredUsers = mx.getIgnoredUsers();
            await mx.setIgnoredUsers(ignoredUsers.filter((id) => !userIds.includes(id)));
          }
        },
      },
      [Command.MyRoomNick]: {
        name: Command.MyRoomNick,
        description: 'Change nick in current room.',
        exe: async (payload) => {
          let nick: string | null = payload.trim();
          if (nick === '') nick = profile.displayName ?? null;
          const mEvent = room
            .getLiveTimeline()
            .getState(EventTimeline.FORWARDS)
            ?.getStateEvents(EventType.RoomMember, mx.getSafeUserId());
          const content = mEvent?.getContent<RoomMemberEventContent>();
          if (!content) return;
          await mx.sendStateEvent(room.roomId, EventType.RoomMember, content, mx.getSafeUserId());
        },
      },
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
          const avatarUrl: string | undefined = args[5];
          const name: string | undefined = args[3];
          const profileId = args[1];

          if (!avatarUrl || !name || !profileId) {
            sendFeedback(`invalid payload`, room, mx.getSafeUserId());
            return;
          }

          const pmp: PerMessageProfile = {
            id: profileId,
            name: name || '',
            avatarUrl,
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
          const content = mEvent?.getContent<RoomMemberEventContent>();
          if (!content) return;
          const updatedContent: RoomMemberEventContent = { ...content };
          if (isRemove) {
            // Reset to global avatar
            const globalAvatar = mx.getUser(mx.getSafeUserId())?.avatarUrl ?? undefined;
            (updatedContent as RoomMemberEventContent & { avatar_url?: string }).avatar_url =
              globalAvatar;
          } else {
            if (!trimmed.match(/^mxc:\/\/\S+$/)) {
              // bad mxc
              return;
            }
            (updatedContent as RoomMemberEventContent & { avatar_url?: string }).avatar_url =
              trimmed;
          }
          await mx.sendStateEvent(
            room.roomId,
            EventType.RoomMember,
            updatedContent,
            mx.getSafeUserId()
          );
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
      [Command.Delete]: {
        name: Command.Delete,
        description:
          'Delete messages from users. Example: /delete userId1 servername -past 1d|2h|5m|30s [-t m.room.message] [-r spam]',
        exe: async (payload) => {
          const [content, flags] = splitPayloadContentAndFlags(payload);
          const users = parseUsers(content);
          const servers = parseServers(content);

          const flagToContent = parseFlags(flags);
          const reason = flagToContent.r;
          const pastContent = flagToContent.past ?? '';
          const msgTypeContent = flagToContent.t;
          const messageTypes: string[] = msgTypeContent ? splitWithSpace(msgTypeContent) : [];

          const ts = parseTimestampFlag(pastContent);
          if (!ts) return;

          const serverMembers = servers?.flatMap((server) => getServerMembers(room, server));
          const serverUsers = serverMembers?.map((m) => m.userId);

          if (Array.isArray(serverUsers)) {
            serverUsers.forEach((user) => {
              if (!users.includes(user)) users.push(user);
            });
          }

          const result = await mx.timestampToEvent(room.roomId, ts, Direction.Forward);
          const startEventId = result.event_id;

          const path = `/rooms/${encodeURIComponent(room.roomId)}/context/${encodeURIComponent(
            startEventId
          )}`;
          const eventContext = await mx.http.authedRequest<IContextResponse>(Method.Get, path, {
            limit: 0,
          });

          let token: string | undefined = eventContext.start;
          while (token) {
            // oxlint-disable-next-line no-await-in-loop
            const response = await mx.createMessagesRequest(
              room.roomId,
              token,
              20,
              Direction.Forward
            );
            const { end, chunk } = response;
            // remove until the latest event;
            token = end;

            const eventsToDelete = chunk.filter(
              (roomEvent) =>
                (messageTypes.length > 0 ? messageTypes.includes(roomEvent.type) : true) &&
                users.includes(roomEvent.sender) &&
                roomEvent.unsigned?.redacted_because === undefined
            );

            const eventIds = eventsToDelete.map((roomEvent) => roomEvent.event_id);

            // oxlint-disable-next-line no-await-in-loop
            await rateLimitedActions(eventIds, (eventId) =>
              mx.redactEvent(room.roomId, eventId, undefined, { reason })
            );
          }
        },
      },
      [Command.Acl]: {
        name: Command.Acl,
        description:
          'Manage server access control list. Example: /acl [-a servername1] [-d servername2] [-ra servername1] [-rd servername2]',
        exe: async (payload) => {
          const [, flags] = splitPayloadContentAndFlags(payload);

          const flagToContent = parseFlags(flags);
          const allowFlag = flagToContent.a;
          const denyFlag = flagToContent.d;
          const removeAllowFlag = flagToContent.ra;
          const removeDenyFlag = flagToContent.rd;

          const allowList = allowFlag ? splitWithSpace(allowFlag) : [];
          const denyList = denyFlag ? splitWithSpace(denyFlag) : [];
          const removeAllowList = removeAllowFlag ? splitWithSpace(removeAllowFlag) : [];
          const removeDenyList = removeDenyFlag ? splitWithSpace(removeDenyFlag) : [];

          const serverAcl = getStateEvent(
            room,
            EventType.RoomServerAcl
          )?.getContent<RoomServerAclEventContent>();

          const aclContent: RoomServerAclEventContent = {
            allow: serverAcl?.allow ? [...serverAcl.allow] : [],
            allow_ip_literals: serverAcl?.allow_ip_literals,
            deny: serverAcl?.deny ? [...serverAcl.deny] : [],
          };

          allowList.forEach((servername) => {
            if (!Array.isArray(aclContent.allow) || aclContent.allow.includes(servername)) return;
            aclContent.allow.push(servername);
          });
          denyList.forEach((servername) => {
            if (!Array.isArray(aclContent.deny) || aclContent.deny.includes(servername)) return;
            aclContent.deny.push(servername);
          });

          aclContent.allow = aclContent.allow?.filter(
            (servername) => !removeAllowList.includes(servername)
          );
          aclContent.deny = aclContent.deny?.filter(
            (servername) => !removeDenyList.includes(servername)
          );

          aclContent.allow?.sort();
          aclContent.deny?.sort();

          await mx.sendStateEvent(room.roomId, EventType.RoomServerAcl, aclContent);
        },
      },
      // Sable commands
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
      [Command.Color]: {
        name: Command.Color,
        description: getFromCommandRegistry('color').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('color');
          await cmd.execute({ mx, room });
        },
      },
      [Command.SColor]: {
        name: Command.SColor,
        description:
          'Set your color for the current Space. Example: /scolor #ff00ff | /scolor reset',
        exe: async () => {
          const cmd = getFromCommandRegistry('scolor');
          await cmd.execute({ mx, room });
        },
      },
      [Command.Font]: {
        name: Command.Font,
        description: getFromCommandRegistry('font').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('font');
          await cmd.execute({ mx, room });
        },
      },
      [Command.SFont]: {
        name: Command.SFont,
        description: 'Set a font for the current Space. Example: /sfont Courier New | /sfont reset',
        exe: async () => {
          const cmd = getFromCommandRegistry('sfont');
          await cmd.execute({ mx, room });
        },
      },
      [Command.AddWidget]: {
        name: Command.AddWidget,
        description: 'Add a widget to this room. Usage: /addwidget <url> [name]',
        exe: async (payload) => {
          const userId = mx.getSafeUserId();

          const parts = payload.trim().split(/\s+/);
          const url = parts[0];
          const name = parts.slice(1).join(' ') || 'Widget';

          if (!url) {
            sendFeedback('Usage: /addwidget <url> [name]', room, userId);
            return;
          }

          let parsedUrl: URL;
          try {
            parsedUrl = new URL(url);
          } catch {
            sendFeedback('Invalid URL. Please provide a valid widget URL.', room, userId);
            return;
          }

          try {
            const widgetId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            await mx.sendStateEvent(
              room.roomId,
              CustomStateEvent.RoomWidget,
              {
                type: 'm.custom',
                url: enrichWidgetUrl(parsedUrl.toString()),
                name,
                id: widgetId,
                creatorUserId: userId,
              },
              widgetId
            );
            sendFeedback(`Widget "${name}" added.`, room, userId);
          } catch (e: unknown) {
            if (e instanceof MatrixError && e.errcode === ErrorCode.M_FORBIDDEN) {
              sendFeedback(
                'Permission denied. You need permission to manage widgets in this room.',
                room,
                userId
              );
            } else {
              sendFeedback(
                `Failed to add widget: ${(e as Error).message || 'Unknown error'}`,
                room,
                userId
              );
            }
          }
        },
      },
      [Command.Pronoun]: {
        name: Command.Pronoun,
        description: getFromCommandRegistry('pronoun').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('pronoun');
          await cmd.execute({ mx, room });
        },
      },
      [Command.SPronoun]: {
        name: Command.SPronoun,
        description: getFromCommandRegistry('spronoun').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('pronoun');
          await cmd.execute({ mx, room });
        },
      },
      [Command.Rainbow]: {
        name: Command.Rainbow,
        description: 'Send rainbow text.',
        exe: async (payload, html) => {
          if (!payload || payload.trim().length === 0) return;
          const inputHtml = html || payload;
          const rainbowHtml = rainbowify(inputHtml);
          await mx.sendMessage(room.roomId, {
            msgtype: MsgType.Text,
            body: payload,
            format: 'org.matrix.custom.html',
            formatted_body: rainbowHtml,
          });
        },
      },
      [Command.RawMsg]: {
        name: Command.RawMsg,
        description:
          '[Dev only] Send raw message event. Example: /rawmsg {"msgtype":"m.text", "body":"hello"}',
        exe: async (payload) => {
          const userId = mx.getSafeUserId();
          if (!developerTools) {
            sendFeedback('Command available in Developer Mode only.', room, userId);
            return;
          }
          try {
            const content = JSON.parse(payload);
            await mx.sendMessage(room.roomId, content);
          } catch (e: unknown) {
            sendFeedback(`Invalid JSON: ${(e as Error).message}`, room, userId);
          }
        },
      },
      [Command.Raw]: {
        name: Command.Raw,
        description: '[Dev only] Send any raw event. Usage: /raw <type> <json> [-s stateKey]',
        exe: async (payload) => {
          const userId = mx.getSafeUserId();

          if (!developerTools) {
            sendFeedback('Command available in Developer Mode only.', room, userId);
            return;
          }

          const [mainPayload, flags] = splitPayloadContentAndFlags(payload);
          const flagMap = parseFlags(flags);
          const stateKey = flagMap.s;
          const parts = mainPayload.trim().split(/\s+/);
          const eventType = parts[0] ?? '';
          const jsonString = mainPayload.trim().substring(eventType.length).trim();

          if (!eventType || !jsonString) {
            sendFeedback('Usage: /rawevent <type> <json> [-s stateKey]', room, userId);
            return;
          }

          try {
            const content = JSON.parse(jsonString);

            if (typeof stateKey === 'string') {
              await mx.sendStateEvent(
                room.roomId,
                eventType as Parameters<typeof mx.sendStateEvent>[1],
                content,
                stateKey
              );
              sendFeedback(
                `State event "${eventType}" sent with state key "${stateKey}".`,
                room,
                userId
              );
            } else {
              await mx.sendEvent(
                room.roomId,
                eventType as unknown as Parameters<typeof mx.sendEvent>[2],
                content
              );
              sendFeedback(`Event "${eventType}" sent.`, room, userId);
            }
          } catch (e: unknown) {
            sendFeedback(`Error: ${(e as Error).message}`, room, userId);
          }
        },
      },
      [Command.RawAcc]: {
        name: Command.RawAcc,
        description: '[Dev only] Merge global account data. Usage: /rawacc <type> <json>',
        exe: async (payload) => {
          const userId = mx.getSafeUserId();

          if (!developerTools) {
            sendFeedback('Command available in Developer Mode only.', room, userId);
            return;
          }

          const trimmed = payload.trim();
          const firstSpaceIndex = trimmed.indexOf(' ');
          if (firstSpaceIndex === -1) {
            sendFeedback('Usage: /rawacc <type> <json>', room, userId);
            return;
          }

          const type = trimmed.substring(0, firstSpaceIndex);
          const jsonString = trimmed.substring(firstSpaceIndex).trim();

          try {
            const newContent = JSON.parse(jsonString);

            const existingEvent = mx.getAccountData(
              type as Parameters<typeof mx.getAccountData>[0]
            );
            const existingContent = existingEvent ? existingEvent.getContent() : {};

            const mergedContent = { ...existingContent, ...newContent };

            await mx.setAccountData(type as Parameters<typeof mx.setAccountData>[0], mergedContent);
            sendFeedback(`Account data "${type}" merged successfully.`, room, userId);
          } catch (e: unknown) {
            sendFeedback(`Error: ${(e as Error).message}`, room, userId);
          }
        },
      },
      [Command.DelAcc]: {
        name: Command.DelAcc,
        description: '[Dev Only] Remove a key from account data. Usage: /delacc <type> <key>',
        exe: async (payload) => {
          const userId = mx.getSafeUserId();
          const parts = payload.trim().split(/\s+/);
          if (parts.length < 2) {
            sendFeedback('Usage: /delacc <type> <key>', room, userId);
            return;
          }
          const [type, key] = parts;
          try {
            const existingEvent = mx.getAccountData(
              type as Parameters<typeof mx.getAccountData>[0]
            );
            if (!existingEvent) {
              sendFeedback(`No account data found for type "${type}".`, room, userId);
              return;
            }
            if (!key) {
              sendFeedback(`Key "${key}" not found in "${type}".`, room, userId);
              return;
            }
            const content = { ...existingEvent?.getContent() };
            if (!(key in content)) {
              sendFeedback(`Key "${key}" not found in "${type}".`, room, userId);
              return;
            }
            delete content[key as keyof typeof content];
            await mx.setAccountData(
              type as Parameters<typeof mx.setAccountData>[0],
              content as Parameters<typeof mx.setAccountData>[1]
            );
            sendFeedback(`Key "${key}" removed from "${type}".`, room, userId);
          } catch (e: unknown) {
            sendFeedback(`Error: ${(e as Error).message}`, room, userId);
          }
        },
      },
      [Command.SetExt]: {
        name: Command.SetExt,
        description: '[Dev Only] Set an extended profile property. Usage: /setext <key> <value>',
        exe: async (payload) => {
          const userId = mx.getSafeUserId();
          if (!developerTools) {
            sendFeedback('Command available in Developer Mode only.', room, userId);
            return;
          }
          const parts = payload.trim().split(/\s+/);
          if (parts.length < 2) {
            sendFeedback('Usage: /setext <key> <value>', room, userId);
            return;
          }
          const key = parts[0];
          const value = parts.slice(1).join(' ');
          let finalValue: string | number | boolean = value;
          if (value === 'true') finalValue = true;
          else if (value === 'false') finalValue = false;
          else if (!Number.isNaN(Number(value)) && value.trim() !== '') finalValue = Number(value);
          try {
            if (typeof mx.setExtendedProfileProperty === 'function') {
              await mx.setExtendedProfileProperty(key ?? '', finalValue);
              sendFeedback(
                `Extended profile property "${key}" set to: ${finalValue}`,
                room,
                userId
              );
            } else {
              sendFeedback('Error: setExtendedProfileProperty is not supported.', room, userId);
            }
          } catch (e: unknown) {
            sendFeedback(`Failed to set extended profile: ${(e as Error).message}`, room, userId);
          }
        },
      },
      [Command.DelExt]: {
        name: Command.DelExt,
        description: '[Dev Only] Remove an extended profile property. Usage: /delext <key>',
        exe: async (payload) => {
          const userId = mx.getSafeUserId();
          const key = payload.trim();

          if (!developerTools) {
            sendFeedback('Command available in Developer Mode only.', room, userId);
            return;
          }

          if (!key) {
            sendFeedback('Usage: /delext <key>', room, userId);
            return;
          }

          try {
            if (typeof mx.deleteExtendedProfileProperty === 'function') {
              await mx.deleteExtendedProfileProperty(key);
              sendFeedback(`Extended profile property "${key}" removed.`, room, userId);
            } else {
              sendFeedback('Error: setExtendedProfileProperty is not supported.', room, userId);
            }
          } catch (e: unknown) {
            sendFeedback(`Failed to remove property: ${(e as Error).message}`, room, userId);
          }
        },
      },
      [Command.DiscardSession]: {
        name: Command.DiscardSession,
        description: getFromCommandRegistry('discardSession').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('discardSession');
          await cmd.execute({ mx, room });
        },
      },
      [Command.Html]: {
        name: Command.Html,
        description: getFromCommandRegistry('html').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('html');
          await cmd.execute({ mx, room });
        },
      },
      // Sharing E2EE History of a room with a user
      [Command.ShareE2EEHistory]: {
        name: Command.ShareE2EEHistory,
        description:
          'Share E2EE history (MSC4268) of this room with a user. Example: /sharee2eehistory @user:example.org',
        exe: async (payload) => {
          const targetUserId = payload.trim();
          const { roomId } = room;
          if (!enableMSC4268CMD) {
            sendFeedback(
              'This command is disabled. Enable it under experimental settings to use it.',
              room,
              mx.getSafeUserId()
            );
            return;
          }
          if (!targetUserId) {
            sendFeedback('Usage: /sharee2eehistory @user:example.org', room, mx.getSafeUserId());
            return;
          }
          const crypto = mx.getCrypto();
          if (!crypto) {
            sendFeedback('Encryption is not enabled on this client.', room, mx.getSafeUserId());
            return;
          }
          crypto
            .shareRoomHistoryWithUser(roomId, targetUserId)
            .then(() => {
              sendFeedback(
                `E2EE history shared with ${targetUserId}. (Their client needs to support MSC4268)`,
                room,
                mx.getSafeUserId()
              );
            })
            .catch((e) => {
              sendFeedback(
                `Failed to share E2EE history: ${(e as Error).message}`,
                room,
                mx.getSafeUserId()
              );
            });
        },
      },
      // Cute Events
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
        description: getFromCommandRegistry('headpat').getCommandDefinition().description,
        // not really like any of the other cute events, but it was too good not to include
        exe: async () => {
          const cmd = getFromCommandRegistry('headpat');
          await cmd.execute({ mx, room });
        },
      },
      // Meta commands
      [Command.Report]: {
        name: Command.Report,
        description: getFromCommandRegistry('bugreport').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('bugreport');
          await cmd.execute({ mx, room });
        },
      },
      [Command.Location]: {
        name: Command.Location,
        description: getFromCommandRegistry('location').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('location');
          await cmd.execute({ mx, room });
        },
      },
      [Command.ShareMyLocation]: {
        name: Command.ShareMyLocation,
        description: getFromCommandRegistry('sharemylocation').getCommandDefinition().description,
        exe: async () => {
          const cmd = getFromCommandRegistry('sharemylocation');
          await cmd.execute({ mx, room });
        },
      },
    }),
    [
      mx,
      navigateRoom,
      room,
      profile.displayName,
      pkitcmdHandler,
      developerTools,
      enableMSC4268CMD,
    ]
  );

  return commands;
};
