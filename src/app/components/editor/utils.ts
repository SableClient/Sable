import type { BasePoint, BaseRange } from 'slate';
import { Editor, Element, Point, Range, Text, Transforms } from 'slate';
import type { Room } from '$types/matrix-sdk';
import type { Nicknames } from '$state/nicknames';
import { getMxIdLocalPart, isUserId } from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room';
import { BlockType } from './types';
import type {
  CommandElement,
  EmoticonElement,
  FormattedText,
  LinkElement,
  MentionElement,
} from './slate';

export type MentionResolveOptions = {
  room?: Room;
  nicknames?: Nicknames;
  mxUserId?: string;
};

/** Same @-prefix rule as {@link UserMentionAutocomplete} and timeline mention insertion. */
export const formatUserMentionDisplayName = (name: string): string =>
  name.startsWith('@') ? name : `@${name}`;

export const resolveUserMentionName = (userId: string, options?: MentionResolveOptions): string => {
  const base =
    (options?.room && getMemberDisplayName(options.room, userId, options.nicknames)) ??
    getMxIdLocalPart(userId) ??
    userId;
  return formatUserMentionDisplayName(base);
};

/** {@link UserMentionAutocomplete} passes a display label, @room must stay literal, not resolved as a user. */
export const mentionNameForUserAutocomplete = (
  id: string,
  displayName: string,
  options?: MentionResolveOptions
): string => {
  if (displayName === '@room') return '@room';
  return resolveUserMentionName(id, options);
};

/** Same #-prefix rule as {@link RoomMentionAutocomplete}. */
export const formatRoomMentionDisplayName = (name: string): string => {
  if (name === '@room') return '@room';
  return name.startsWith('#') ? name : `#${name}`;
};

export const resolveRoomMentionName = (
  roomIdOrAlias: string,
  label: string,
  options?: MentionResolveOptions
): string => {
  const trimmed = label.trim();
  if (trimmed === '@room') return '@room';
  if (trimmed) return formatRoomMentionDisplayName(trimmed);
  if (
    options?.room &&
    (options.room.roomId === roomIdOrAlias || options.room.getCanonicalAlias() === roomIdOrAlias)
  ) {
    return formatRoomMentionDisplayName(options.room.name || roomIdOrAlias);
  }
  return formatRoomMentionDisplayName(roomIdOrAlias);
};

export const resolveUserMentionHighlight = (
  userId: string,
  options?: MentionResolveOptions
): boolean => options?.mxUserId === userId;

export const resolveRoomMentionHighlight = (
  roomIdOrAlias: string,
  options?: MentionResolveOptions
): boolean => {
  if (!options?.room) return true;
  const { roomId } = options.room;
  const alias = options.room.getCanonicalAlias();
  return roomId === roomIdOrAlias || alias === roomIdOrAlias;
};

export const formatMentionElementDisplayName = (element: MentionElement): string => {
  if (isUserId(element.id)) {
    return formatUserMentionDisplayName(element.name);
  }
  if (element.name === '@room') return '@room';
  return formatRoomMentionDisplayName(element.name);
};

export const resetEditor = (editor: Editor) => {
  Transforms.delete(editor, {
    at: {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    },
  });

  Transforms.setNodes(editor, { type: BlockType.Paragraph });
};

export const resetEditorHistory = (editor: Editor) => {
  editor.history = {
    undos: [],
    redos: [],
  };
};

export const createMentionElement = (
  id: string,
  name: string,
  highlight: boolean,
  eventId?: string,
  viaServers?: string[]
): MentionElement => ({
  type: BlockType.Mention,
  id,
  eventId,
  viaServers,
  highlight,
  name,
  children: [{ text: '' }],
});

export const createEmoticonElement = (key: string, shortcode: string): EmoticonElement => ({
  type: BlockType.Emoticon,
  key,
  shortcode,
  children: [{ text: '' }],
});

export const createLinkElement = (
  href: string,
  children: string | FormattedText[]
): LinkElement => ({
  type: BlockType.Link,
  href,
  children: typeof children === 'string' ? [{ text: children }] : children,
});

export const createCommandElement = (command: string): CommandElement => ({
  type: BlockType.Command,
  command,
  children: [{ text: '' }],
});

export const replaceWithElement = (editor: Editor, selectRange: BaseRange, element: Element) => {
  Transforms.select(editor, selectRange);
  Transforms.insertNodes(editor, element);
  Transforms.collapse(editor, {
    edge: 'end',
  });
};

export const moveCursor = (editor: Editor, withSpace?: boolean) => {
  Transforms.move(editor);
  if (withSpace) editor.insertText(' ');
  Transforms.collapse(editor, { edge: 'end' });
};

interface PointUntilCharOptions {
  match: (char: string) => boolean;
  reverse?: boolean;
}
export const getPointUntilChar = (
  editor: Editor,
  cursorPoint: BasePoint,
  options: PointUntilCharOptions
): BasePoint | undefined => {
  let targetPoint: BasePoint | undefined;
  let prevPoint: BasePoint | undefined;
  let char: string | undefined;

  const pointItr = Editor.positions(editor, {
    at: {
      anchor: Editor.start(editor, []),
      focus: Editor.point(editor, cursorPoint, { edge: 'start' }),
    },
    unit: 'character',
    reverse: options.reverse,
  });

  for (const point of pointItr) {
    if (!Point.equals(point, cursorPoint) && prevPoint) {
      char = Editor.string(editor, { anchor: point, focus: prevPoint });

      if (options.match(char)) break;
      targetPoint = point;
    }
    prevPoint = point;
  }
  return targetPoint;
};

export const getPrevWorldRange = (editor: Editor): BaseRange | undefined => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return undefined;
  const [cursorPoint] = Range.edges(selection);
  const worldStartPoint = getPointUntilChar(editor, cursorPoint, {
    reverse: true,
    // line breaks produce empty chars, not \n
    match: (char) => /\s|^$/.test(char),
  });
  return worldStartPoint && Editor.range(editor, worldStartPoint, cursorPoint);
};

export const isEmptyEditor = (editor: Editor): boolean => {
  const firstChildren = editor.children[0];
  if (firstChildren && Element.isElement(firstChildren)) {
    return editor.children.length === 1 && Editor.isEmpty(editor, firstChildren);
  }
  return false;
};

export const getBeginCommand = (editor: Editor): string | undefined => {
  const lineBlock = editor.children[0];
  if (!Element.isElement(lineBlock)) return undefined;
  if (lineBlock.type !== BlockType.Paragraph) return undefined;

  const [firstInline, secondInline] = lineBlock.children;
  const isEmptyText = Text.isText(firstInline) && firstInline.text.trim() === '';
  if (!isEmptyText) return undefined;
  if (Element.isElement(secondInline) && secondInline.type === BlockType.Command)
    return secondInline.command;
  return undefined;
};

export const getMarkdownCodeSpanRanges = (text: string): [number, number][] => {
  const ranges: [number, number][] = [];
  let openRun: { start: number; length: number } | undefined;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '`') {
      let runEnd = index;
      while (runEnd < text.length && text[runEnd] === '`') {
        runEnd += 1;
      }

      const runLength = runEnd - index;
      if (!openRun) {
        openRun = { start: index, length: runLength };
      } else if (openRun.length === runLength) {
        ranges.push([openRun.start, runEnd]);
        openRun = undefined;
      }

      index = runEnd - 1;
    }
  }

  return ranges;
};

export const isInsideMarkdownCodeSpan = (
  start: number,
  end: number,
  codeSpanRanges: [number, number][]
): boolean => codeSpanRanges.some(([rangeStart, rangeEnd]) => start > rangeStart && end < rangeEnd);
