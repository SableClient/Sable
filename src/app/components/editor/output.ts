import { Descendant, Editor, Text } from 'slate';
import { MatrixClient } from '$types/matrix-sdk';
import { sanitizeText } from '$utils/sanitize';
import {
  parseBlockMD,
  parseInlineMD,
  unescapeMarkdownBlockSequences,
  unescapeMarkdownInlineSequences,
} from '$plugins/markdown';
import { findAndReplace } from '$utils/findAndReplace';
import { sanitizeForRegex } from '$utils/regex';
import { isUserId } from '$utils/matrix';
import { CustomElement } from './slate';
import { BlockType } from './types';

export type OutputOptions = {
  allowTextFormatting?: boolean;
  allowInlineMarkdown?: boolean;
  allowBlockMarkdown?: boolean;
  /**
   * if true it will remove the nickname of the person from the message
   */
  stripNickname?: boolean;
  /**
   * a map of regex patterns to replace nicknames with, used when stripNickname is true
   */
  nickNameReplacement?: Map<RegExp, string>;
};

const textToCustomHtml = (node: Text, opts: OutputOptions): string => {
  let string = sanitizeText(node.text);
  if (opts.allowTextFormatting) {
    if (node.bold) string = `<strong>${string}</strong>`;
    if (node.italic) string = `<i>${string}</i>`;
    if (node.underline) string = `<u>${string}</u>`;
    if (node.strikeThrough) string = `<s>${string}</s>`;
    if (node.code) string = `<code>${string}</code>`;
    if (node.spoiler) string = `<span data-mx-spoiler>${string}</span>`;
  }

  if (opts.allowInlineMarkdown && string === sanitizeText(node.text)) {
    string = parseInlineMD(string);
  }

  return string;
};

const elementToCustomHtml = (node: CustomElement, children: string): string => {
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}<br/>`;
    case BlockType.Heading:
      return `<h${node.level}>${children}</h${node.level}>`;
    case BlockType.CodeLine:
      return `${children}\n`;
    case BlockType.CodeBlock:
      return `<pre><code>${children}</code></pre>`;
    case BlockType.QuoteLine:
      return `${children}<br/>`;
    case BlockType.BlockQuote:
      return `<blockquote>${children}</blockquote>`;
    case BlockType.ListItem:
      return `<li><p>${children}</p></li>`;
    case BlockType.OrderedList:
      return `<ol>${children}</ol>`;
    case BlockType.UnorderedList:
      return `<ul>${children}</ul>`;
    case BlockType.Small:
      return `<sub>${children}</sub>`;
    case BlockType.HorizontalRule:
      return `<hr/>`;

    case BlockType.Mention: {
      let fragment = node.id;

      if (node.eventId) {
        fragment += `/${node.eventId}`;
      }
      if (node.viaServers && node.viaServers.length > 0) {
        fragment += `?${node.viaServers.map((server) => `via=${server}`).join('&')}`;
      }

      const matrixTo = `https://matrix.to/#/${fragment}`;
      return `<a href="${encodeURI(matrixTo)}">${sanitizeText(node.name)}</a>`;
    }
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://')
        ? `<img data-mx-emoticon src="${node.key}" alt="${sanitizeText(
            node.shortcode
          )}" title="${sanitizeText(node.shortcode)}" height="32" />`
        : sanitizeText(node.key);
    case BlockType.Link:
      return `<a href="${encodeURI(node.href)}">${node.children}</a>`;
    case BlockType.Command:
      return `/${sanitizeText(node.command)}`;
    default:
      return children;
  }
};

const HTML_TAG_REG_G = /<([\w-]+)(?: [^>]*)?(?:(?:\/>)|(?:>.*?<\/\1>))/g;
const ignoreHTMLParseInlineMD = (text: string): string =>
  findAndReplace(
    text,
    HTML_TAG_REG_G,
    (match) => match[0],
    (txt) => parseInlineMD(txt)
  ).join('');

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
    if (opts.allowBlockMarkdown && 'type' in n && n.type === BlockType.Paragraph) {
      let line = toMatrixCustomHTML(n, {
        ...opts,
        allowInlineMarkdown: false,
        allowBlockMarkdown: false,
      })
        .replace(/<br\/>$/, '\n')
        .replace(/^(\\*)&gt;/, '$1>');

      // strip nicknames if needed
      if (opts.stripNickname && opts.nickNameReplacement) {
        opts.nickNameReplacement?.keys().forEach((key) => {
          const replacement = opts.nickNameReplacement!.get(key) ?? '';
          line = line.replaceAll(key, replacement);
        });
      }
      markdownLines += line;
      if (index === targetNodes.length - 1) {
        return parseBlockMD(markdownLines, ignoreHTMLParseInlineMD);
      }
      return '';
    }

    const parsedMarkdown = parseBlockMD(markdownLines, ignoreHTMLParseInlineMD);
    markdownLines = '';
    const isCodeLine = 'type' in n && n.type === BlockType.CodeLine;
    if (isCodeLine) return `${parsedMarkdown}${toMatrixCustomHTML(n, {})}`;

    return `${parsedMarkdown}${toMatrixCustomHTML(n, { ...opts, allowBlockMarkdown: false })}`;
  };
  if (Array.isArray(node))
    return node.map((element, index, array) => parseNode(element, index, array)).join('');
  if (Text.isText(node)) return textToCustomHtml(node, opts);

  const children = node.children
    .map((element, index, array) => parseNode(element, index, array))
    .join('');
  return elementToCustomHtml(node, children);
};

const elementToPlainText = (node: CustomElement, children: string): string => {
  switch (node.type) {
    case BlockType.Paragraph:
      return `${children}\n`;
    case BlockType.Heading:
      return `${children}\n`;
    case BlockType.CodeLine:
      return `${children}\n`;
    case BlockType.CodeBlock:
      return `${children}\n`;
    case BlockType.QuoteLine:
      return `| ${children}\n`;
    case BlockType.BlockQuote:
      return `${children}\n`;
    case BlockType.ListItem:
      return `- ${children}\n`;
    case BlockType.OrderedList:
      return `${children}\n`;
    case BlockType.UnorderedList:
      return `${children}\n`;
    case BlockType.Mention:
      return node.id;
    case BlockType.Emoticon:
      return node.key.startsWith('mxc://') ? `:${node.shortcode}:` : node.key;
    case BlockType.Link:
      return `[${node.children}](${node.href})`;
    case BlockType.Command:
      return `/${node.command}`;
    case BlockType.Small:
      return `-# ${children}\n`;
    case BlockType.HorizontalRule:
      return `\n---\n`;
    default:
      return children;
  }
};

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
  isMarkdown: boolean,
  stripNickname = false,
  nickNameReplacement?: Map<RegExp, string>
): string => {
  if (Array.isArray(node))
    return node.map((n) => toPlainText(n, isMarkdown, stripNickname, nickNameReplacement)).join('');
  if (Text.isText(node)) {
    if (stripNickname && nickNameReplacement) {
      let { text } = node;
      nickNameReplacement?.keys().forEach((key) => {
        const replacement = nickNameReplacement.get(key) ?? '';
        text = text.replaceAll(key, replacement);
      });
      return isMarkdown
        ? unescapeMarkdownBlockSequences(text, unescapeMarkdownInlineSequences)
        : text;
    }
    return isMarkdown
      ? unescapeMarkdownBlockSequences(node.text, unescapeMarkdownInlineSequences)
      : node.text;
  }

  const children = node.children.map((n) => toPlainText(n, isMarkdown)).join('');
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
  const cmdRegX = new RegExp(`^(\\s+)?(\\/${sanitizeForRegex(cmdName)})([^\\S\n]+)?`);

  const match = new RegExp(cmdRegX).exec(str);
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
    if (node.type === BlockType.CodeBlock) return;

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
