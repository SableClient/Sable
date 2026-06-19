import { EventType, MsgType } from '$types/matrix-sdk';
import type { MatrixEvent } from '$types/matrix-sdk';
import { trimReplyFromFormattedBody } from '$utils/room';

const REACTION_EVENT_TYPE: string = EventType.Reaction;
const ENCRYPTED_EVENT_TYPE: string = EventType.RoomMessageEncrypted;
const ROOM_MESSAGE_EVENT_TYPE: string = EventType.RoomMessage;
const STICKER_EVENT_TYPE: string = EventType.Sticker;

export type MessagePreviewKind =
  | 'text'
  | 'link'
  | 'image'
  | 'video'
  | 'audio'
  | 'file'
  | 'location'
  | 'poll'
  | 'call'
  | 'sticker'
  | 'encrypted'
  | 'unsupported';

export type MessagePreviewModel = {
  kind: MessagePreviewKind;
  text: string;
  placeholderText: string;
  body?: string;
  formattedBody?: string;
  msgType?: string;
  isEdited?: boolean;
  isLinkOnly?: boolean;
  hasBlockContent?: boolean;
  canRenderInline?: boolean;
};

type PreviewContentInput = {
  content?: Record<string, unknown>;
  eventType?: string;
  effectiveType?: string;
  isRedacted?: boolean;
};

/**
 * Strip the legacy reply fallback (lines starting with `> `) that some
 * clients prepend when replying to a message.
 */
export function stripReplyFallback(body: string): string {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i]?.startsWith('> ')) i += 1;
  if (i > 0 && i < lines.length && lines[i] === '') i += 1;
  return lines.slice(i).join('\n');
}

const isBlockFormattedBody = (formattedBody: string): boolean =>
  /<(?:pre)(?:\s|>)/i.test(formattedBody);

const isBlockBody = (body: string): boolean => /^\s*```[\s\S]*```(?:\s*)$/m.test(body.trim());

export function getPreviewEventContent(ev: MatrixEvent): Record<string, unknown> {
  const content = ev.getContent() as Record<string, unknown>;
  const replacingEvent = typeof ev.replacingEvent === 'function' ? ev.replacingEvent() : undefined;
  let displayContent =
    replacingEvent && !replacingEvent.isBeingDecrypted() && !replacingEvent.isEncrypted()
      ? (replacingEvent.getContent() as Record<string, unknown>)
      : content;

  if (replacingEvent && displayContent['m.new_content']) {
    displayContent = displayContent['m.new_content'] as Record<string, unknown>;
  }

  return displayContent;
}

export function getPreviewEventType(ev: MatrixEvent): string {
  return (ev.getEffectiveEvent()?.type as string | undefined) ?? ev.getType();
}

export function buildMessagePreviewFromContent({
  content,
  eventType,
  effectiveType,
  isRedacted,
}: PreviewContentInput): MessagePreviewModel | undefined {
  if (isRedacted) return undefined;
  if (!content) return undefined;

  const resolvedType = effectiveType ?? eventType;
  if (!resolvedType) return undefined;
  const looksDecryptedRoomMessage =
    typeof content.msgtype === 'string' ||
    typeof content.body === 'string' ||
    typeof content.formatted_body === 'string';
  const previewType =
    resolvedType === ENCRYPTED_EVENT_TYPE && looksDecryptedRoomMessage
      ? ROOM_MESSAGE_EVENT_TYPE
      : resolvedType;

  if (resolvedType === REACTION_EVENT_TYPE) return undefined;

  const relType = content['m.relates_to'] as Record<string, unknown> | undefined;
  if (relType?.rel_type === 'm.replace') return undefined;

  if (
    (resolvedType === ENCRYPTED_EVENT_TYPE && !looksDecryptedRoomMessage) ||
    (eventType === ENCRYPTED_EVENT_TYPE && !looksDecryptedRoomMessage)
  ) {
    return {
      kind: 'encrypted',
      text: '🔒 Encrypted message',
      placeholderText: '🔒 Encrypted message',
      canRenderInline: false,
    };
  }

  if (previewType === ROOM_MESSAGE_EVENT_TYPE) {
    const msgtype = content.msgtype;
    if (msgtype === MsgType.Text || msgtype === MsgType.Emote || msgtype === MsgType.Notice) {
      const rawBody = content.body;
      if (typeof rawBody !== 'string') return undefined;

      const body = stripReplyFallback(rawBody);
      const formattedBody =
        typeof content.formatted_body === 'string'
          ? trimReplyFromFormattedBody(content.formatted_body).trim()
          : undefined;
      const trimmed = body.trim();

      if (formattedBody && isBlockFormattedBody(formattedBody)) {
        return {
          kind: 'unsupported',
          text: '💻 Code Block',
          placeholderText: '💻 Code Block',
          body,
          formattedBody,
          msgType: typeof msgtype === 'string' ? msgtype : undefined,
          hasBlockContent: true,
          canRenderInline: false,
        };
      }

      if (isBlockBody(body)) {
        return {
          kind: 'unsupported',
          text: '💻 Code Block',
          placeholderText: '💻 Code Block',
          body,
          formattedBody,
          msgType: typeof msgtype === 'string' ? msgtype : undefined,
          hasBlockContent: true,
          canRenderInline: false,
        };
      }

      if (/^https?:\/\/[^\s]+$/i.test(trimmed)) {
        return {
          kind: 'link',
          text: '🔗 Link',
          placeholderText: '🔗 Link',
          body,
          formattedBody,
          msgType: typeof msgtype === 'string' ? msgtype : undefined,
          isLinkOnly: true,
          canRenderInline: true,
        };
      }

      return {
        kind: 'text',
        text: body,
        placeholderText: body,
        body,
        formattedBody,
        msgType: typeof msgtype === 'string' ? msgtype : undefined,
        canRenderInline: true,
      };
    }

    if (msgtype === MsgType.Image)
      return {
        kind: 'image',
        text: '📷 Image',
        placeholderText: '📷 Image',
        msgType: MsgType.Image,
        canRenderInline: false,
      };
    if (msgtype === MsgType.Video)
      return {
        kind: 'video',
        text: '📹 Video',
        placeholderText: '📹 Video',
        msgType: MsgType.Video,
        canRenderInline: false,
      };
    if (msgtype === MsgType.Audio)
      return {
        kind: 'audio',
        text: '🎵 Audio',
        placeholderText: '🎵 Audio',
        msgType: MsgType.Audio,
        canRenderInline: false,
      };
    if (msgtype === MsgType.File)
      return {
        kind: 'file',
        text: '📎 File',
        placeholderText: '📎 File',
        msgType: MsgType.File,
        canRenderInline: false,
      };
    if (msgtype === 'm.location') {
      return {
        kind: 'location',
        text: '📍 Location',
        placeholderText: '📍 Location',
        msgType: 'm.location',
        canRenderInline: false,
      };
    }
  }

  if (previewType === STICKER_EVENT_TYPE) {
    const text = `🎉 ${typeof content.body === 'string' && content.body.trim() ? content.body : 'Sticker'}`;
    return {
      kind: 'sticker',
      text,
      placeholderText: text,
      canRenderInline: false,
    };
  }

  if (previewType === 'org.matrix.msc3381.poll.start' || previewType === 'm.poll.start') {
    const pollContent = content['org.matrix.msc3381.poll.start'] ?? content['m.poll.start'];
    const question =
      typeof pollContent === 'object' && pollContent !== null
        ? (pollContent as { question?: Record<string, unknown> }).question
        : undefined;
    const textParts = question?.['m.text'];
    const pollBodyCandidate =
      (Array.isArray(textParts)
        ? (textParts[0] as { body?: unknown } | undefined)?.body
        : undefined) ??
      question?.['org.matrix.msc1767.text'] ??
      question?.body;
    const pollBody =
      typeof pollBodyCandidate === 'string' && pollBodyCandidate.trim()
        ? pollBodyCandidate.trim()
        : 'Poll';
    return {
      kind: 'poll',
      text: `📊 ${pollBody}`,
      placeholderText: `📊 ${pollBody}`,
      canRenderInline: false,
    };
  }

  if (previewType === 'org.matrix.msc3401.call' || previewType === 'm.call.invite') {
    return {
      kind: 'call',
      text: '📞 Started a call',
      placeholderText: '📞 Started a call',
      canRenderInline: false,
    };
  }
  if (previewType === 'm.call.answer') {
    return {
      kind: 'call',
      text: '📞 Answered call',
      placeholderText: '📞 Answered call',
      canRenderInline: false,
    };
  }
  if (previewType === 'm.call.hangup') {
    return {
      kind: 'call',
      text: '📞 Ended call',
      placeholderText: '📞 Ended call',
      canRenderInline: false,
    };
  }

  if (previewType === 'im.vector.modular.widgets') {
    const text = content.type === 'jitsi' ? '📞 Started a Jitsi call' : '🧩 Added a widget';
    return {
      kind: 'call',
      text,
      placeholderText: text,
      canRenderInline: false,
    };
  }

  return undefined;
}

export function buildMessagePreview(ev: MatrixEvent): MessagePreviewModel | undefined {
  if (ev.isRedacted()) return undefined;

  const replacingEvent = typeof ev.replacingEvent === 'function' ? ev.replacingEvent() : undefined;
  const preview = buildMessagePreviewFromContent({
    content: getPreviewEventContent(ev),
    eventType: ev.getType(),
    effectiveType: getPreviewEventType(ev),
    isRedacted: ev.isRedacted(),
  });

  if (!preview) return undefined;

  return {
    ...preview,
    isEdited: !!replacingEvent,
  };
}

export function canRenderInlineMessagePreview(preview: MessagePreviewModel): boolean {
  return (
    preview.canRenderInline === true &&
    !preview.hasBlockContent &&
    (preview.kind === 'text' || preview.kind === 'link') &&
    (typeof preview.formattedBody === 'string' || typeof preview.body === 'string')
  );
}

type StoredPreviewInput = {
  body?: string;
  msgType?: string;
};

export function buildStoredMessagePreview({
  body,
  msgType,
}: StoredPreviewInput): MessagePreviewModel | undefined {
  if (typeof body !== 'string' && typeof msgType !== 'string') return undefined;

  return buildMessagePreviewFromContent({
    content: {
      ...(typeof body === 'string' ? { body } : {}),
      msgtype: typeof msgType === 'string' ? msgType : MsgType.Text,
    },
    eventType: ROOM_MESSAGE_EVENT_TYPE,
  });
}
