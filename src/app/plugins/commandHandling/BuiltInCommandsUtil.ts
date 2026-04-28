import { CommandDefinition } from '$types/schemas/command';
import { splitWithSpace } from '$utils/common';
import { isServerName, isUserId } from '$utils/matrix';
import * as cmdListDef from './builtIn.commands.json';

export function getCmdDescription(cmdId: string): CommandDefinition {
  return cmdListDef.commands.find((cmd) => cmd.id === cmdId) as CommandDefinition;
}

const FLAG_PAT = String.raw`(?:^|\s)-(\w+)\b`;
const FLAG_REG = new RegExp(FLAG_PAT);

export const splitPayloadContentAndFlags = (payload: string): [string, string | undefined] => {
  const flagMatch = new RegExp(FLAG_REG).exec(payload);

  if (!flagMatch) {
    return [payload, undefined];
  }
  const content = payload.slice(0, flagMatch.index);
  const flags = payload.slice(flagMatch.index);

  return [content, flags];
};

/**
 * parse a list of user ids in form of a string
 * @param payload the list of users
 * @returns a parsed list of user ids
 */
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
