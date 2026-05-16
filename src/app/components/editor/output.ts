import type { Descendant, Editor } from 'slate';
import { Text } from 'slate';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { sanitizeText } from '$utils/sanitize';
import { markdownToHtml, injectDataMd } from '$plugins/markdown';
import { sanitizeForRegex } from '$utils/regex';
import { getMxIdLocalPart, isUserId } from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room';
import type { CustomElement } from './slate';
import { BlockType } from './types';
import { getMarkdownCodeSpanRanges, isInsideMarkdownCodeSpan } from './utils';
import { MATRIX_TO_BASE, testMatrixTo } from '$plugins/matrix-to';

export type OutputOptions = {
  /**
   * if true it will remove the nickname of the person from the message
   */
  stripNickname?: boolean;
  /**
   * a map of regex patterns to replace nicknames with, used when stripNickname is true
   */
  nickNameReplacement?: Map<RegExp, string>;
  /** When true, markdown HTML omits the leading `<p>` wrapper (for `m.emote` / `/me`). */
  forEmote?: boolean;
  room?: Room;
};

const textToCustomHtml = (node: Text): string => sanitizeText(node.text);

const markdownInlineLinkLabel = (label: string, fallback: string): string => {
  const t = label.trim();
  if (!t) return fallback;
  if (t.includes(']')) return fallback;
  for (let i = 0; i < t.length; i++) {
    if (t.charCodeAt(i) <= 0x1f) return fallback;
  }
  return t;
};

const userMentionMarkdownLinkLabel = (userId: string, room: Room | undefined): string => {
  const fallback = getMxIdLocalPart(userId) ?? userId;
  if (!room) return fallback;
  const fromMembership = getMemberDisplayName(room, userId);
  return markdownInlineLinkLabel(fromMembership ?? '', fallback);
};

const elementToCustomHtml = (
  node: CustomElement,
  children: string,
  opts: OutputOptions
): string => {
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}<br/>`;

    case BlockType.Mention: {
      let fragment = node.id;

      if (node.eventId) {
        fragment += `/${node.eventId}`;
      }
      if (node.viaServers && node.viaServers.length > 0) {
        fragment += `?${node.viaServers.map((server) => `via=${server}`).join('&')}`;
      }

      const matrixTo = `${MATRIX_TO_BASE}#/${fragment}`;
      if (node.name === '@room') {
        return `[@room](${encodeURI(matrixTo)})`;
      }
      if (isUserId(node.id)) {
        const label = userMentionMarkdownLinkLabel(node.id, opts.room);
        return `[${label}](${encodeURI(matrixTo)})`;
      }
      return sanitizeText(matrixTo);
    }
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://')
        ? `<img data-mx-emoticon src="${node.key}" alt="${sanitizeText(
            node.shortcode
          )}" title="${sanitizeText(node.shortcode)}" height="32" />`
        : sanitizeText(node.key);
    case BlockType.Link:
      return testMatrixTo(node.href)
        ? sanitizeText(node.href)
        : `<a href="${encodeURI(node.href)}" target="_blank" rel="noreferrer noopener">${children}</a>`;
    case BlockType.Command:
      return `/${sanitizeText(node.command)}`;
    default:
      return children;
  }
};

/**
 * convert slate internal representation to a custom HTML string that can be sent to the server
 * @param node slate node
 * @param opts options for output
 * @returns custom HTML string
 */
export const toMatrixCustomHTML = (
  node: Descendant | Descendant[],
  opts: OutputOptions
): string => {
  let markdownLines = '';
  const parseNode = (n: Descendant, index: number, targetNodes: Descendant[]) => {
    if ('type' in n && n.type === BlockType.Paragraph) {
      let line = toMatrixCustomHTML(n, opts);

      // Use \n for all paragraphs to prevent extra blank lines from
      // accumulating on each edit cycle.
      line = line.replace(/<br\/>$/, '\n').replace(/^(\\*)&gt;/, '$1>');

      // strip nicknames if needed
      if (opts.stripNickname && opts.nickNameReplacement) {
        opts.nickNameReplacement?.keys().forEach((key) => {
          const replacement = opts.nickNameReplacement!.get(key) ?? '';
          line = line.replaceAll(key, replacement);
        });
      }
      markdownLines += line;
      if (index === targetNodes.length - 1) {
        const html = markdownToHtml(markdownLines, { emote: opts.forEmote });
        return injectDataMd(html);
      }
      return '';
    }

    const parsedMarkdown = markdownToHtml(markdownLines, { emote: opts.forEmote });
    markdownLines = '';
    return `${parsedMarkdown}${toMatrixCustomHTML(n, opts)}`;
  };
  if (Array.isArray(node))
    return node.map((element, index, array) => parseNode(element, index, array)).join('');
  if (Text.isText(node)) return textToCustomHtml(node);

  const children = node.children
    .map((element, index, array) => parseNode(element, index, array))
    .join('');
  return elementToCustomHtml(node, children, opts);
};

const elementToPlainText = (node: CustomElement, children: string): string => {
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}\n`;
    case BlockType.Mention:
      return node.name === '@room' ? node.name : node.id;
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://') ? `:${node.shortcode}:` : node.key;
    case BlockType.Link:
      return `[${children}](${node.href})`;
    case BlockType.Command:
      return `/${node.command}`;
    default:
      return children;
  }
};

const SPOILERINPUTREGEX = /\|\|.+?\|\|/g;
const LINK_URL = `(https?:\\/\\/.[A-Za-z0-9-._~:/?#[\\()@!$&'*+,;%=]+)`;
export const LINKINPUTREGEX = new RegExp(`\\(?(${LINK_URL})\\)?`, 'g');
const SPOILEREDLINKINPUTREGEX = new RegExp(`<(${LINK_URL})>`, 'g');
const SPOILEREDLINKDIRECTREGEX = new RegExp(`\\|\\|(${LINK_URL})\\|\\|`, 'g');

/**
 * convert slate internal representation to a plain text string that can be sent to the server
 * @param node the slate node
 * @param isMarkdown set true if it's a markdown formatted text
 * @param stripNickname whether to strip nicknames
 * @param nickNameReplacement the nickname replacement
 * @returns the plain text we want to send
 */
export const toPlainText = (
  node: Descendant | Descendant[],
  stripNickname = false,
  nickNameReplacement?: Map<RegExp, string>
): string => {
  if (Array.isArray(node))
    return node.map((n) => toPlainText(n, stripNickname, nickNameReplacement)).join('');
  if (Text.isText(node)) {
    let { text } = node;

    text = text.replaceAll(SPOILERINPUTREGEX, '[Spoiler]');
    text = text.replaceAll(SPOILEREDLINKINPUTREGEX, '$1');

    if (stripNickname && nickNameReplacement) {
      nickNameReplacement?.keys().forEach((key) => {
        const replacement = nickNameReplacement.get(key) ?? '';
        text = text.replaceAll(key, replacement);
      });
    }
    return text;
  }

  const children = node.children
    .map((n) => toPlainText(n, stripNickname, nickNameReplacement))
    .join('');
  return elementToPlainText(node, children);
};

/**
 * Convert slate internal representation to a raw plain text string without any replacements.
 * This is used for link extraction to ensure we have the full context for markdown blocks.
 */
export const toRawText = (node: Descendant | Descendant[]): string => {
  if (Array.isArray(node)) return node.map(toRawText).join('');
  if (Text.isText(node)) return node.text;

  const children = node.children.map(toRawText).join('');
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}\n`;
    case BlockType.Link:
      return `[${children}](${node.href})`;
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://') ? `:${node.shortcode}:` : node.key;
    case BlockType.Mention:
      return node.name === '@room' ? node.name : node.id;
    case BlockType.Command:
      return `/${node.command}`;
    default:
      return children;
  }
};

/**
 * Check if customHtml is equals to plainText
 * by replacing `<br/>` with `/n` in customHtml
 * and sanitizing plainText before comparison
 * because text are sanitized in customHtml
 * @param customHtml string
 * @param plain string
 * @returns boolean
 */
export const customHtmlEqualsPlainText = (customHtml: string, plain: string): boolean =>
  customHtml.replaceAll('<br/>', '\n') === sanitizeText(plain);

export const trimCustomHtml = (customHtml: string) => customHtml.replaceAll(/<br\/>$/g, '').trim();

export const trimCommand = (cmdName: string, str: string) => {
  const escapedCmd = sanitizeForRegex(cmdName);
  // Allow optional leading whitespace and/or <p> tag for HTML strings
  const cmdRegX = new RegExp(`^(?:\\s+)?(?:<p>)?(?:\\/${escapedCmd})(?:[^\\S\n]+)?`, 'i');

  const match = cmdRegX.exec(str);
  if (!match) return str;
  return str.slice(match[0].length);
};

/**
 * Type representing Mentions
 */
export type MentionsData = {
  /**
   * a boolean to denote if it's a room mention
   */
  room: boolean;
  /**
   * a set of user ids that are mentioned in the message
   */
  users: Set<string>;
};

/**
 * get the mentions in a message
 * @param mx the matrix client
 * @param roomId the room id we will send the message in
 * @param editor the slate editor
 * @returns the mentions in a message {@link MentionsData}
 */
export const getMentions = (mx: MatrixClient, roomId: string, editor: Editor): MentionsData => {
  const mentionData: MentionsData = {
    room: false,
    users: new Set(),
  };

  const parseMentions = (node: Descendant): void => {
    if (Text.isText(node)) return;

    if (node.type === BlockType.Mention) {
      if (node.name === '@room') {
        mentionData.room = true;
      }

      if (isUserId(node.id) && node.id !== mx.getUserId()) {
        mentionData.users.add(node.id);
      }

      return;
    }

    node.children.forEach(parseMentions);
  };

  editor.children.forEach(parseMentions);

  return mentionData;
};

export const getLinks = (serialized: Descendant | Descendant[]): string[] | undefined => {
  const text = toRawText(serialized);
  const finalList = new Set<string>();

  // 1. Find all potential URLs
  const urlsMatch = text.matchAll(LINKINPUTREGEX);
  const spoileredUrlsMatch = [...text.matchAll(SPOILEREDLINKINPUTREGEX)].map((m) => m[1]);
  const directSpoileredUrlsMatch = [...text.matchAll(SPOILEREDLINKDIRECTREGEX)].map((m) => m[1]);
  const allSpoilered = new Set([...spoileredUrlsMatch, ...directSpoileredUrlsMatch]);

  const codeSpanRanges = getMarkdownCodeSpanRanges(text);

  for (const match of urlsMatch) {
    let url = match[1]!;
    const fullMatch = match[0];
    const index = match.index;

    // Clean up surrounding parens from markdown [label](url) or (url)
    if (fullMatch.startsWith('(') && fullMatch.endsWith(')')) {
      url = fullMatch.substring(1, fullMatch.length - 1);
    } else if (fullMatch.startsWith('(')) {
      url = fullMatch.substring(1);
    } else if (fullMatch.endsWith('/)')) {
      url = fullMatch.substring(0, fullMatch.length - 1);
    }

    if (allSpoilered.has(url)) continue;

    // Check if it's inside a code span/block
    if (isInsideMarkdownCodeSpan(index, index + fullMatch.length, codeSpanRanges)) {
      continue;
    }

    if (url.startsWith(MATRIX_TO_BASE)) continue;

    finalList.add(url);
  }

  return Array.from(finalList);
};
