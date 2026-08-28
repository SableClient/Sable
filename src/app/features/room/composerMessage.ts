import type { IContent, MatrixEvent, Room } from '$types/matrix-sdk';
import { getDocumentBeginCommand, type EditorDocument } from '$components/editor/model';
import { MsgType } from '$types/matrix-sdk';
import type { MatrixClient, RoomMessageEventContent } from '$types/matrix-sdk';
import {
  BlockType,
  customHtmlEqualsPlainText,
  getDocumentLinks,
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
import { ProfileCatalog } from '$app/persona/catalog';
import type { PerMessageProfileMsc4461 } from '$app/persona';
import { convertPerMessageProfileToBeeperFormat } from '$app/persona/projection';
import { resolvePersonaProxy } from '$app/persona/proxy';
import { resolvePersona } from '$app/persona/selection';
import * as prefix from '$unstable/prefixes';
import { outgoingMessageTransforms } from './outgoingMessageTransforms';
import { buildReplacementContent } from './buildReplacementContent';
import { Command, SHRUG, TABLEFLIP, UNFLIP } from '$hooks/useCommands';
import type { MSC4459ImagePackReference } from '$types/matrix/common';
import type { SerializableMap } from '$types/wrapper/SerializableMap';

export type MessageContent = IContent & Pick<RoomMessageEventContent, 'msgtype' | 'body'>;

/**
 * Branches needing React state (opening a picker, running a command, reacting) are
 * returned as descriptors rather than executed, keeping this module pure.
 */
export type OutgoingMessage =
  | { kind: 'message'; content: MessageContent; latchPersona?: PerMessageProfileMsc4461 }
  | { kind: 'quickReact'; key: string }
  | { kind: 'pkCommand'; plainText: string }
  | { kind: 'command'; command: Command; plainText: string; customHtml: string }
  | { kind: 'gifSearch'; query: string }
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
  pmpNoFallback: boolean;
  /** Persona latched by an earlier proxied message in this room. */
  latchedPersona: PerMessageProfileMsc4461 | undefined;
  isPKCommand: (plainText: string) => boolean;
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
  children: EditorDocument,
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
  getMentions(mx, roomId, { children })?.users?.forEach(add);

  return replacement;
};

const stripCommandNode = (children: EditorDocument): EditorDocument => {
  const firstPara = children[0];
  if (firstPara?.type === BlockType.Paragraph) {
    const commandIndex = firstPara.children.findIndex(
      (token) => !('text' in token) && token.type === BlockType.Command
    );
    if (commandIndex !== -1) {
      return [
        { ...firstPara, children: firstPara.children.slice(commandIndex + 1) },
        ...children.slice(1),
      ];
    }
  }
  return children;
};

const applyPerMessageProfileFallback = (
  content: MessageContent,
  profile: PerMessageProfileMsc4461,
  noFallback: boolean
) => {
  content[prefix.MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME] =
    convertPerMessageProfileToBeeperFormat(profile, !noFallback);
  if (noFallback || profile.displayname.trim() === '') return;

  // Per spec a per-message profile must ship a fallback prefix for clients that ignore it.
  const pmpPrefix = `${profile.displayname}: `;
  const bodyWithoutFallback = content.body.startsWith(pmpPrefix)
    ? content.body.slice(pmpPrefix.length)
    : content.body;

  const htmlPrefix = `<strong data-mx-profile-fallback>${sanitizeText(profile.displayname)}: </strong>`;
  if (content.formatted_body && !content.formatted_body.startsWith(htmlPrefix)) {
    content.formatted_body = htmlPrefix + content.formatted_body;
  } else {
    // we don't have a formatted body, but the fallback needs one
    content.format = 'org.matrix.custom.html';
    const escapedBody = sanitizeText(bodyWithoutFallback).replaceAll('\n', '<br/>');
    content.formatted_body = `${htmlPrefix}${escapedBody}`;
  }

  // guard against double-prefixing when the fallback is already present
  if (!content.body.startsWith(pmpPrefix)) content.body = pmpPrefix + content.body;
};

export async function buildOutgoingMessage(
  children: EditorDocument,
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
    pmpNoFallback,
    latchedPersona,
    isPKCommand,
    imagePacksUsed,
  } = deps;

  const commandName = getDocumentBeginCommand(children);
  const nicknameReplacement = buildNicknameReplacement(children, deps);
  const transformContext = { isMarkdown: true, settingsLinkBaseUrl };

  const runTransforms = (input: EditorDocument): EditorDocument => {
    let output = input;
    outgoingMessageTransforms.forEach((transform) => {
      if (!transform.shouldApply(output, transformContext)) return;
      output = transform.apply(output, transformContext);
    });
    return output;
  };
  const forEmote = commandName === Command.Me || commandName === Command.RainbowMe;
  const serializeHtml = (input: EditorDocument) =>
    trimCustomHtml(
      toMatrixCustomHTML(input, {
        stripNickname: true,
        nickNameReplacement: nicknameReplacement,
        forEmote,
        room,
      })
    );

  let serializedChildren = runTransforms(
    (commandName ? stripCommandNode(children) : children) as EditorDocument
  );
  let plainText = toPlainText(serializedChildren, true, true, nicknameReplacement).trim();
  let customHtml = serializeHtml(serializedChildren);
  let msgType = MsgType.Text;

  if (canSendReaction && plainText.startsWith('+#')) {
    return { kind: 'quickReact', key: plainText.substring(2) };
  }
  if (pkCompatEnable && isPKCommand(plainText)) {
    return { kind: 'pkCommand', plainText };
  }
  const rawGifCommand =
    commandName === undefined ? plainText.match(/^\/gif(?:\s+(.*))?$/i) : undefined;
  if (rawGifCommand) return { kind: 'gifSearch', query: rawGifCommand[1] ?? '' };

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
    if (commandName === 'gif') return { kind: 'gifSearch', query: plainText };
    return { kind: 'command', command: commandName as Command, plainText, customHtml };
  }

  if (plainText === '') return { kind: 'empty' };

  // PluralKit-style proxy wrappers must be stripped before building `content`, otherwise
  // the wrapper itself gets sent verbatim.
  const catalog = new ProfileCatalog(mx);
  let proxiedPerMessageProfile: PerMessageProfileMsc4461 | undefined;
  let proxyStripped = false;
  if (pmpProxyingEnable) {
    const proxy = resolvePersonaProxy(
      await catalog.list({ migrate: false }),
      toPlainText(serializedChildren, true, false, nicknameReplacement).trim()
    );
    if (proxy) {
      proxiedPerMessageProfile = proxy.persona;
      const stripped = proxy.body;
      if (stripped !== undefined) {
        proxyStripped = true;
        // Re-run the normal pipeline so a proxied message is parsed like any other.
        serializedChildren = runTransforms(plainToEditorInput(stripped));
        plainText = toPlainText(serializedChildren, true, true, nicknameReplacement).trim();
        customHtml = serializeHtml(serializedChildren);
      }
    }
  }

  const mentionData = getMentions(mx, roomId, { children });
  if (replyDraft && !silentReply) mentionData.users.add(replyDraft.userId);

  const content: MessageContent = { msgtype: msgType, body: plainText };
  content['m.mentions'] = getMentionContent(Array.from(mentionData.users), mentionData.room);
  content[prefix.MATRIX_UNSTABLE_IMAGE_SOURCE_PACK_PROPERTY_NAME] = imagePacksUsed.toJSON();
  content[prefix.MATRIX_UNSTABLE_EMBEDDED_LINK_PREVIEW_PROPERTY_NAME] = (
    getDocumentLinks(serializedChildren) ?? []
  ).map((matched_url) => ({ matched_url }));

  if (replyDraft || !customHtmlEqualsPlainText(customHtml, plainText)) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = customHtml;
  }

  const [account, roomSelection] = await Promise.all([
    catalog.getSelection('account'),
    catalog.getSelection({ roomId }),
  ]);
  const perMessageProfile = resolvePersona({
    proxy: proxiedPerMessageProfile,
    latched: latchedPersona,
    room: roomSelection,
    account,
    now: Date.now(),
  });
  if (perMessageProfile) applyPerMessageProfileFallback(content, perMessageProfile, pmpNoFallback);

  return {
    kind: 'message',
    content,
    // Only a proxy we actually stripped counts as used, so a wrapper we failed to
    // strip does not latch the persona for the rest of the room.
    latchPersona: pmpLatchingEnable && proxyStripped ? proxiedPerMessageProfile : undefined,
  };
}

export interface BuildEditReplacementDeps {
  mx: MatrixClient;
  room: Room;
  roomId: string;
  editingEvent: MatrixEvent;
  /** Content of the latest edit, so a re-edit builds on the current body. */
  currentContent: IContent;
  pmpNoFallback: boolean;
}

/** Returns undefined when there is nothing to send, which cancels the edit. */
export function buildEditReplacement(
  children: EditorDocument,
  { mx, room, roomId, editingEvent, currentContent, pmpNoFallback }: BuildEditReplacementDeps
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

  const mentionData = getMentions(mx, roomId, { children });
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
    (getDocumentLinks(children) ?? []).map((matched_url) => ({ matched_url })),
    // An edit belongs to the identity used for the original event, not the currently selected one.
    currentContent['com.beeper.per_message_profile'] ??
      oldContent['com.beeper.per_message_profile'],
    pmpNoFallback
  );
}
