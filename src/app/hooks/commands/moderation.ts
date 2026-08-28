import type { IContextResponse, RoomServerAclEventContent } from '$types/matrix-sdk';
import { Direction, EventType, KnownMembership, Method } from '$types/matrix-sdk';
import { isUserId, rateLimitedActions } from '$utils/matrix';
import { getStateEvent } from '$utils/room/hierarchy';
import { splitWithSpace } from '$utils/common';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';
import {
  getServerMembers,
  parseFlags,
  parseServers,
  parseTimestampFlag,
  parseUsers,
  splitPayloadContentAndFlags,
} from './parsing';

export const createModerationCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room } = ctx;
  return {
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
      description: 'Disinvite user to room. Example: /disinvite userId1 userId2 [-r reason]',
      exe: async (payload) => {
        const [content, flags] = splitPayloadContentAndFlags(payload);
        const users = parseUsers(content);
        const flagToContent = parseFlags(flags);
        const reason = flagToContent.r;
        users.map((id) => mx.kick(room.roomId, id, reason));
      },
    },
    [Command.Kick]: {
      name: Command.Kick,
      description: 'Kick user from room. Example: /kick userId1 userId2 servername [-r reason]',
      exe: async (payload) => {
        const [content, flags] = splitPayloadContentAndFlags(payload);
        const users = parseUsers(content);
        const servers = parseServers(content);
        const flagToContent = parseFlags(flags);
        const reason = flagToContent.r;

        const serverMembers = servers?.flatMap((server) => getServerMembers(room, server));
        const serverUsers = serverMembers
          ?.filter((m) => m.membership !== KnownMembership.Ban)
          .map((m) => m.userId);

        if (Array.isArray(serverUsers)) {
          serverUsers.forEach((user) => {
            if (!users.includes(user)) users.push(user);
          });
        }

        rateLimitedActions(users, (id) => mx.kick(room.roomId, id, reason));
      },
    },
    [Command.Ban]: {
      name: Command.Ban,
      description: 'Ban user from room. Example: /ban userId1 userId2 servername [-r reason]',
      exe: async (payload) => {
        const [content, flags] = splitPayloadContentAndFlags(payload);
        const users = parseUsers(content);
        const servers = parseServers(content);
        const flagToContent = parseFlags(flags);
        const reason = flagToContent.r;

        const serverMembers = servers?.flatMap((server) => getServerMembers(room, server));
        const serverUsers = serverMembers?.map((m) => m.userId);

        if (Array.isArray(serverUsers)) {
          serverUsers.forEach((user) => {
            if (!users.includes(user)) users.push(user);
          });
        }

        rateLimitedActions(users, (id) => mx.ban(room.roomId, id, reason));
      },
    },
    [Command.UnBan]: {
      name: Command.UnBan,
      description: 'Unban user from room. Example: /unban userId1 userId2',
      exe: async (payload) => {
        const rawIds = splitWithSpace(payload);
        const users = rawIds.filter((id) => isUserId(id));
        users.map((id) => mx.unban(room.roomId, id));
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
  };
};
