import { MsgType } from '$types/matrix-sdk';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import type { CommandContext, CommandRecord } from './types';
import { Command } from './types';
import { parseFlags, splitPayloadContentAndFlags } from './parsing';

export const createRawCommands = (ctx: CommandContext): Partial<CommandRecord> => {
  const { mx, room, developerTools } = ctx;
  return {
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

          const existingEvent = mx.getAccountData(type as Parameters<typeof mx.getAccountData>[0]);
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
          const existingEvent = mx.getAccountData(type as Parameters<typeof mx.getAccountData>[0]);
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
            sendFeedback(`Extended profile property "${key}" set to: ${finalValue}`, room, userId);
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
      description: 'Force discard the current outbound E2EE session in this room.',
      exe: async () => {
        const userId = mx.getSafeUserId();

        try {
          const crypto = mx.getCrypto();
          if (!crypto) {
            sendFeedback('Encryption is not enabled on this client.', room, userId);
            return;
          }
          await crypto.forceDiscardSession(room.roomId);
          sendFeedback('Outbound encryption session discarded.', room, userId);
        } catch (e: unknown) {
          sendFeedback(`Failed to discard session: ${(e as Error).message}`, room, userId);
        }
      },
    },
    [Command.Html]: {
      name: Command.Html,
      description:
        'Send a message with HTML content. Example: /html <span data-mx-color="#ff0000">Red</span>',
      exe: async (payload) => {
        await mx.sendMessage(room.roomId, {
          msgtype: MsgType.Text,
          body: payload
            .replaceAll('<br>', '\n')
            .replaceAll('<li>', '\n- ')
            .replaceAll(
              /<a(.*?)href="(?<link>(.*?))"(.*?)>(?<text>(.*?))<\/a>/g,
              '[$<text>]($<link>)'
            )
            .replaceAll(/<[^>]*>/g, ''),
          format: 'org.matrix.custom.html',
          formatted_body: payload,
        });
      },
    },
  };
};
