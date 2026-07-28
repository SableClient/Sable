import type { Editor } from 'slate';
import type { IContent, MatrixEvent, Room } from '$types/matrix-sdk';
import { MsgType } from '$types/matrix-sdk';
import type { MatrixClient, RoomMessageEventContent } from '$types/matrix-sdk';
import {
  BlockType,
  customHtmlEqualsPlainText,
  getBeginCommand,
  getLinks,
  getMentions,
  plainToEditorInput,
  toMatrixCustomHTML,
  toPlainText,
  trimCommand,
  trimCustomHtml,
} from '$components/editor';
import { sanitizeText } from '$utils/sanitize';
import { getMentionContent } from '$utils/room/relations';
import type { IReplyDraft } from '$state/room/roomInputDrafts';
import {
  convertPerMessageProfileToBeeperFormat,
  getCurrentlyUsedPerMessageProfileForAccount,
  getCurrentlyUsedPerMessageProfileForRoom,
  type PerMessageProfile,
} from '$hooks/usePerMessageProfile';
import * as prefix from '$unstable/prefixes';
import { outgoingMessageTransforms } from './outgoingMessageTransforms';
import { buildReplacementContent } from './buildReplacementContent';
import { Command, SHRUG, TABLEFLIP, UNFLIP } from '$hooks/useCommands';
import type { PKitProxyMessageHandler } from '$plugins/pluralkit-handler/PKitProxyMessageHandler';
import type { MSC4459ImagePackReference } from '$types/matrix/common';
import type { SerializableMap } from '$types/wrapper/SerializableMap';

export type MessageContent = IContent & Pick<RoomMessageEventContent, 'msgtype' | 'body'>;

/**
 * Branches needing React state (opening a picker, running a command, reacting) are
 * returned as descriptors rather than executed, keeping this module pure.
 */
export type OutgoingMessage =
  | { kind: 'message'; content: MessageContent; latchPersona?: PerMessageProfile }
  | { kind: 'quickReact'; key: string }
  | { kind: 'pkCommand'; plainText: string }
  | { kind: 'command'; command: Command; plainText: string; customHtml: string }
  | { kind: 'empty' };

export interface BuildOutgoingMessageDeps {
  mx: MatrixClient;
  room: Room;
  roomId: string;
  /** userId -> nickname, stripped from the body and replaced with the real display name. */
  nicknames: Record<string, unknown>;
  replyEvent: MatrixEvent | undefined;
  replyDraft: IReplyDraft | undefined;
  silentReply: boolean;
  settingsLinkBaseUrl: string;
  canSendReaction: boolean;
  pkCompatEnable: boolean;
  pmpProxyingEnable: boolean;
  pmpLatchingEnable: boolean;
  /** Persona latched by an earlier proxied message in this room. */
  latchedPersona: PerMessageProfile | undefined;
  isPKCommand: (plainText: string) => boolean;
  pluralkitProxyMessageHandler: PKitProxyMessageHandler;
  imagePacksUsed: SerializableMap<string, MSC4459ImagePackReference>;
}

const resolveNickname = (
  room: Room,
  nicknames: Record<string, unknown>,
  userId: string
): string | undefined => {
  const nick = nicknames[userId];
  if (typeof nick !== 'string' || nick.length === 0) return undefined;
  return room.getMember(userId)?.rawDisplayName ?? userId;
};

// Nicknames are local-only, so they are swapped back to real display names before the
// body goes out, keeping server-side mention processing correct.
const buildNicknameReplacement = (
  children: Editor['children'],
  { mx, room, roomId, nicknames, replyEvent }: BuildOutgoingMessageDeps
): Map<RegExp, string> => {
  const replacement = new Map<RegExp, string>();
  const add = (userId: string) => {
    const displayName = resolveNickname(room, nicknames, userId);
    if (displayName)
      replacement.set(new RegExp(`@?${nicknames[userId] as string}`, 'g'), displayName);
  };

  const senderId = replyEvent?.getSender();
  if (senderId) add(senderId);
  getMentions(mx, roomId, { children } as Editor)?.users?.forEach(add);

  return replacement;
};

const stripCommandNode = (children: Editor['children']): Editor['children'] => {
  const firstPara = children[0];
  if (
    firstPara &&
    'type' in firstPara &&
    firstPara.type === BlockType.Paragraph &&
    firstPara.children.length >= 2
  ) {
    return [{ ...firstPara, children: firstPara.children.slice(2) }, ...children.slice(1)];
  }
  return children;
};

const applyPerMessageProfileFallback = (content: MessageContent, profile: PerMessageProfile) => {
  content[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME] =
    convertPerMessageProfileToBeeperFormat(profile, profile.name.trim() !== '');
  if (profile.name.trim() === '') return;

  // Per spec a per-message profile must ship a fallback prefix for clients that ignore it.
  const pmpPrefix = `${profile.name}: `;
  // guard against double-prefixing when the fallback is already present
  if (!content.body.startsWith(pmpPrefix)) content.body = pmpPrefix + content.body;

  const htmlPrefix = `<strong data-mx-profile-fallback>${sanitizeText(profile.name)}: </strong>`;
  if (content.formatted_body && !content.formatted_body.startsWith(htmlPrefix)) {
    content.formatted_body = htmlPrefix + content.formatted_body;
  } else {
    // we don't have a formatted body, but the fallback needs one
    content.format = 'org.matrix.custom.html';
    const escapedBody = sanitizeText(content.body).replaceAll('\n', '<br/>');
    content.formatted_body = `${htmlPrefix}${escapedBody}`;
  }
};

export async function buildOutgoingMessage(
  children: Editor['children'],
  deps: BuildOutgoingMessageDeps
): Promise<OutgoingMessage> {
  const {
    mx,
    room,
    roomId,
    replyDraft,
    silentReply,
    settingsLinkBaseUrl,
    canSendReaction,
    pkCompatEnable,
    pmpProxyingEnable,
    pmpLatchingEnable,
    latchedPersona,
    isPKCommand,
    pluralkitProxyMessageHandler,
    imagePacksUsed,
  } = deps;

  const commandName = getBeginCommand({ children } as Editor);
  const nicknameReplacement = buildNicknameReplacement(children, deps);
  const transformContext = { isMarkdown: true, settingsLinkBaseUrl };

  const runTransforms = (input: Editor['children']): Editor['children'] => {
    let output = input;
    outgoingMessageTransforms.forEach((transform) => {
      if (!transform.shouldApply(output, transformContext)) return;
      output = transform.apply(output, transformContext);
    });
    return output;
  };
  const forEmote = commandName === Command.Me || commandName === Command.RainbowMe;
  const serializeHtml = (input: Editor['children']) =>
    trimCustomHtml(
      toMatrixCustomHTML(input, {
        stripNickname: true,
        nickNameReplacement: nicknameReplacement,
        forEmote,
        room,
      })
    );

  let serializedChildren = runTransforms(commandName ? stripCommandNode(children) : children);
  let plainText = toPlainText(serializedChildren, true, true, nicknameReplacement).trim();
  let customHtml = serializeHtml(serializedChildren);
  let msgType = MsgType.Text;

  if (canSendReaction && plainText.startsWith('+#')) {
    return { kind: 'quickReact', key: plainText.substring(2) };
  }
  if (pkCompatEnable && isPKCommand(plainText)) {
    return { kind: 'pkCommand', plainText };
  }

  if (commandName) {
    plainText = trimCommand(commandName, plainText);
    customHtml = trimCommand(commandName, customHtml);
  }
  if (commandName === Command.Me) {
    msgType = MsgType.Emote;
  } else if (commandName === Command.Notice) {
    msgType = MsgType.Notice;
  } else if (commandName === Command.Shrug) {
    plainText = `${SHRUG} ${plainText}`;
    customHtml = `${SHRUG} ${customHtml}`;
  } else if (commandName === Command.TableFlip) {
    plainText = `${TABLEFLIP} ${plainText}`;
    customHtml = `${TABLEFLIP} ${customHtml}`;
  } else if (commandName === Command.UnFlip) {
    plainText = `${UNFLIP} ${plainText}`;
    customHtml = `${UNFLIP} ${customHtml}`;
  } else if (commandName) {
    return { kind: 'command', command: commandName as Command, plainText, customHtml };
  }

  if (plainText === '') return { kind: 'empty' };

  // PluralKit-style proxy wrappers must be stripped before building `content`, otherwise
  // the wrapper itself gets sent verbatim.
  let proxiedPerMessageProfile: PerMessageProfile | undefined;
  if (pmpProxyingEnable) {
    proxiedPerMessageProfile = await pluralkitProxyMessageHandler.getPmpBasedOnMessage(plainText);
    if (proxiedPerMessageProfile) {
      // plainText has spoilers stripped, which breaks spoilers carrying a proxy tag, so
      // match the proxy against an unsanitized copy instead.
      const unsanitizedPlainText = toPlainText(
        serializedChildren,
        true,
        false,
        nicknameReplacement
      ).trim();
      const stripped = pluralkitProxyMessageHandler.stripProxyFromMessage(unsanitizedPlainText);
      if (stripped !== undefined) {
        // Re-run the normal pipeline so a proxied message is parsed like any other.
        serializedChildren = runTransforms(plainToEditorInput(stripped));
        plainText = toPlainText(serializedChildren, true, true, nicknameReplacement).trim();
        customHtml = serializeHtml(serializedChildren);
      }
    }
  }

  const mentionData = getMentions(mx, roomId, { children } as Editor);
  if (replyDraft && !silentReply) mentionData.users.add(replyDraft.userId);

  const content: MessageContent = { msgtype: msgType, body: plainText };
  content['m.mentions'] = getMentionContent(Array.from(mentionData.users), mentionData.room);
  content[prefix.MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME] = imagePacksUsed.toJSON();
  content[prefix.MATRIX_UNSTABLE_EMBEDDED_LINK_PREVIEW_PROPERTY_NAME] = (
    getLinks(serializedChildren) ?? []
  ).map((matched_url) => ({ matched_url }));

  if (replyDraft || !customHtmlEqualsPlainText(customHtml, plainText)) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = customHtml;
  }

  const [globalProfile, roomProfile] = await Promise.all([
    getCurrentlyUsedPerMessageProfileForAccount(mx),
    getCurrentlyUsedPerMessageProfileForRoom(mx, roomId),
  ]);
  const perMessageProfile =
    proxiedPerMessageProfile ?? latchedPersona ?? roomProfile ?? globalProfile;
  if (perMessageProfile) applyPerMessageProfileFallback(content, perMessageProfile);

  return {
    kind: 'message',
    content,
    latchPersona:
      pmpLatchingEnable && proxiedPerMessageProfile ? proxiedPerMessageProfile : undefined,
  };
}

export interface BuildEditReplacementDeps {
  mx: MatrixClient;
  room: Room;
  roomId: string;
  editingEvent: MatrixEvent;
  /** Content of the latest edit, so a re-edit builds on the current body. */
  currentContent: IContent;
}

/** Returns undefined when there is nothing to send, which cancels the edit. */
export function buildEditReplacement(
  children: Editor['children'],
  { mx, room, roomId, editingEvent, currentContent }: BuildEditReplacementDeps
): IContent | undefined {
  const plainText = toPlainText(children).trim();
  if (!plainText) return undefined;

  const eventId = editingEvent.getId();
  if (!eventId) return undefined;

  const oldContent = editingEvent.getContent();
  const customHtml = trimCustomHtml(
    toMatrixCustomHTML(children, {
      forEmote: oldContent.msgtype === MsgType.Emote,
      room,
    })
  );

  const mentionData = getMentions(mx, roomId, { children } as Editor);
  const previousMentions = currentContent['m.mentions'];
  if (
    previousMentions &&
    typeof previousMentions === 'object' &&
    'user_ids' in previousMentions &&
    Array.isArray(previousMentions.user_ids)
  ) {
    previousMentions.user_ids.forEach((userId) => {
      if (typeof userId === 'string') mentionData.users.add(userId);
    });
  }

  return buildReplacementContent(
    oldContent,
    plainText,
    customHtml,
    eventId,
    getMentionContent(Array.from(mentionData.users), mentionData.room),
    (getLinks(children) ?? []).map((matched_url) => ({ matched_url })),
    currentContent['com.beeper.per_message_profile'] ?? oldContent['com.beeper.per_message_profile']
  );
}
