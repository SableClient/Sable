import type { EditorDocument, EditorParagraph, EditorText, InlineToken } from './model';
import { editorDocumentText, isEditorText } from './model';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { sanitizeText } from '$utils/sanitize';
import { markdownToHtml, injectDataMd } from '$plugins/markdown';
import { sanitizeForRegex } from '$utils/regex';
import { getMxIdLocalPart, isUserId } from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room/display';
import { BlockType } from './types';
import { getMarkdownCodeSpanRanges, isInsideMarkdownCodeSpan } from './utils';
import { MATRIX_TO_BASE, testMatrixTo } from '$plugins/matrix-to';

type EditorNode = EditorParagraph | InlineToken;

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

const textToCustomHtml = (node: EditorText): string => sanitizeText(node.text);

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
  node: Exclude<EditorParagraph | InlineToken, EditorText>,
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
      return node.key?.startsWith('mxc://')
        ? `<img data-mx-emoticon src="${node.key}" alt="${sanitizeText(
            node.shortcode
          )}" title="${sanitizeText(node.shortcode)}" height="32" />`
        : sanitizeText(node.key ?? '');
    case BlockType.Link:
      return testMatrixTo(node.href)
        ? sanitizeText(node.href)
        : `<a href="${encodeURI(node.href)}">${children}</a>`;
    case BlockType.Command:
      return `/${sanitizeText(node.command)}`;
    default:
      return children;
  }
};

/**
 * Convert Sable's engine-neutral representation to Matrix custom HTML.
 * @param node Sable editor document or token
 * @param opts options for output
 * @returns custom HTML string
 */
export const toMatrixCustomHTML = (
  node: EditorDocument | EditorParagraph | InlineToken,
  opts: OutputOptions
): string => {
  let markdownLines = '';
  const parseNode = (n: EditorNode, index: number, targetNodes: readonly EditorNode[]) => {
    if ('type' in n && n.type === BlockType.Paragraph) {
      let line = toMatrixCustomHTML(n, opts);

      // Use \n for all paragraphs to prevent extra blank lines from
      // accumulating on each edit cycle.
      line = line.replace(/<br\/>$/, '\n').replace(/^(\\*)&gt;/, '$1>');

      // strip nicknames if needed
      if (opts.stripNickname && opts.nickNameReplacement) {
        for (const [key, replacement] of opts.nickNameReplacement) {
          line = line.replaceAll(key, replacement);
        }
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
  if (isEditorText(node)) return textToCustomHtml(node);

  const children = node.children
    .map((element, index, array) => parseNode(element, index, array as readonly EditorNode[]))
    .join('');
  return elementToCustomHtml(node, children, opts);
};

const elementToPlainText = (
  node: Exclude<EditorParagraph | InlineToken, EditorText>,
  children: string
): string => {
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}\n`;
    case BlockType.Mention:
      return node.name === '@room' ? node.name : node.id;
    case BlockType.Emoticon:
      return node.key?.startsWith('mxc://') ? `:${node.shortcode}:` : (node.key ?? '');
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
 * Convert Sable's engine-neutral representation to a plain text string that can be sent to the server.
 * @param node the Sable editor document or token
 * @param isMarkdown set true if it's a markdown formatted text
 * @param stripNickname whether to strip nicknames
 * @param nickNameReplacement the nickname replacement
 * @returns the plain text we want to send
 */
export const toPlainText = (
  node: EditorDocument | EditorParagraph | InlineToken,
  stripNickname = false,
  stripSpoilers = true,
  nickNameReplacement?: Map<RegExp, string>
): string => {
  if (Array.isArray(node))
    return node
      .map((n) => toPlainText(n, stripNickname, stripSpoilers, nickNameReplacement))
      .join('');
  if (isEditorText(node)) {
    let { text } = node;

    if (stripSpoilers) {
      text = text.replaceAll(SPOILERINPUTREGEX, '[Spoiler]');
      text = text.replaceAll(SPOILEREDLINKINPUTREGEX, '$1');
    }

    if (stripNickname && nickNameReplacement) {
      for (const [key, replacement] of nickNameReplacement) {
        text = text.replaceAll(key, replacement);
      }
    }
    return text;
  }

  const children = node.children
    .map((n) => toPlainText(n, stripNickname, stripSpoilers, nickNameReplacement))
    .join('');
  return elementToPlainText(node, children);
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
 * @param document the current Sable editor document
 * @returns the mentions in a message {@link MentionsData}
 */
export const getMentions = (
  mx: MatrixClient,
  roomId: string,
  document: { children: EditorDocument }
): MentionsData => {
  const mentionData: MentionsData = {
    room: false,
    users: new Set(),
  };

  const parseMentions = (node: InlineToken | EditorDocument[number]): void => {
    if (!('type' in node)) return;
    if (node.type === BlockType.Paragraph) {
      node.children.forEach(parseMentions);
      return;
    }

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

  document.children.forEach(parseMentions);

  return mentionData;
};

/** Link extraction for the engine-neutral document used by outgoing messages. */
export const getDocumentLinks = (document: EditorDocument): string[] | undefined =>
  linksFromText(editorDocumentText(document));

const linksFromText = (text: string): string[] | undefined => {
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
