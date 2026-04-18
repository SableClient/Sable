import { find as findLinks } from 'linkifyjs';
import { Descendant, Text } from 'slate';
import type {
  BlockQuoteElement,
  FormattedText,
  HeadingElement,
  InlineElement,
  ListItemElement,
  OrderedListElement,
  ParagraphElement,
  QuoteLineElement,
  SmallElement,
  UnorderedListElement,
} from '$components/editor/slate';
import { BlockType } from '$components/editor/types';
import { createLinkElement } from '$components/editor/utils';
import { getSettingsLinkLabel, parseSettingsLink } from '$features/settings/settingsLink';

const isMarkdownSettingsLink = (text: string, start: number, end: number): boolean =>
  text.slice(0, start).endsWith('](') && text.slice(end).startsWith(')');

const getMarkdownCodeSpanRanges = (text: string): [number, number][] => {
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

const isInsideMarkdownCodeSpan = (
  start: number,
  end: number,
  codeSpanRanges: [number, number][]
): boolean => codeSpanRanges.some(([rangeStart, rangeEnd]) => start > rangeStart && end < rangeEnd);

const isMarkdownAutolink = (text: string, start: number, end: number): boolean =>
  text[start - 1] === '<' && text[end] === '>';

const isInsideHtmlTag = (text: string, start: number): boolean => {
  const tagStart = text.lastIndexOf('<', start);
  if (tagStart === -1) return false;

  const tagEnd = text.lastIndexOf('>', start);
  if (tagEnd > tagStart) return false;

  return /^<\/?[A-Za-z][^>]*$/.test(text.slice(tagStart, start));
};

const isProtectedMarkdownContext = (
  text: string,
  start: number,
  end: number,
  isMarkdown: boolean,
  codeSpanRanges: [number, number][]
): boolean =>
  isMarkdownSettingsLink(text, start, end) ||
  (isMarkdown &&
    (isInsideMarkdownCodeSpan(start, end, codeSpanRanges) ||
      isMarkdownAutolink(text, start, end) ||
      isInsideHtmlTag(text, start)));

const createTextSegment = (node: FormattedText, text: string): FormattedText => ({
  ...node,
  text,
});

const rewriteInlineText = (
  node: FormattedText,
  baseUrl: string,
  isMarkdown: boolean
): InlineElement[] => {
  const matches = findLinks(node.text, 'url');
  if (matches.length === 0) return [node];

  const codeSpanRanges = isMarkdown ? getMarkdownCodeSpanRanges(node.text) : [];
  const rewritten: InlineElement[] = [];
  let cursor = 0;

  matches.forEach((match) => {
    const href = match.value;
    const settingsLink = parseSettingsLink(baseUrl, href);

    if (
      !settingsLink ||
      isProtectedMarkdownContext(node.text, match.start, match.end, isMarkdown, codeSpanRanges)
    ) {
      return;
    }

    if (cursor < match.start) {
      rewritten.push(createTextSegment(node, node.text.slice(cursor, match.start)));
    }

    rewritten.push(
      createLinkElement(href, [
        createTextSegment(node, getSettingsLinkLabel(settingsLink.section, settingsLink.focus)),
      ])
    );
    cursor = match.end;
  });

  if (rewritten.length === 0) return [node];

  if (cursor < node.text.length) {
    rewritten.push(createTextSegment(node, node.text.slice(cursor)));
  }

  return rewritten.filter((child) => !Text.isText(child) || child.text.length > 0);
};

const rewriteInlineChildren = (
  children: InlineElement[],
  baseUrl: string,
  isMarkdown: boolean
): InlineElement[] =>
  children.flatMap((child) =>
    Text.isText(child) ? rewriteInlineText(child, baseUrl, isMarkdown) : [child]
  );

const rewriteInlineContainer = <
  T extends ParagraphElement | HeadingElement | QuoteLineElement | ListItemElement | SmallElement,
>(
  node: T,
  baseUrl: string,
  isMarkdown: boolean
): T => ({
  ...node,
  children: rewriteInlineChildren(node.children, baseUrl, isMarkdown),
});

const rewriteBlockQuote = (
  node: BlockQuoteElement,
  baseUrl: string,
  isMarkdown: boolean
): BlockQuoteElement => ({
  ...node,
  children: node.children.map((child) => rewriteInlineContainer(child, baseUrl, isMarkdown)),
});

const rewriteOrderedList = (
  node: OrderedListElement,
  baseUrl: string,
  isMarkdown: boolean
): OrderedListElement => ({
  ...node,
  children: node.children.map((child) => rewriteInlineContainer(child, baseUrl, isMarkdown)),
});

const rewriteUnorderedList = (
  node: UnorderedListElement,
  baseUrl: string,
  isMarkdown: boolean
): UnorderedListElement => ({
  ...node,
  children: node.children.map((child) => rewriteInlineContainer(child, baseUrl, isMarkdown)),
});

const rewriteNode = (node: Descendant, baseUrl: string, isMarkdown: boolean): Descendant => {
  if (Text.isText(node)) return node;

  switch (node.type) {
    case BlockType.Paragraph:
    case BlockType.Heading:
    case BlockType.QuoteLine:
    case BlockType.ListItem:
    case BlockType.Small:
      return rewriteInlineContainer(node, baseUrl, isMarkdown);
    case BlockType.BlockQuote:
      return rewriteBlockQuote(node, baseUrl, isMarkdown);
    case BlockType.OrderedList:
      return rewriteOrderedList(node, baseUrl, isMarkdown);
    case BlockType.UnorderedList:
      return rewriteUnorderedList(node, baseUrl, isMarkdown);
    case BlockType.CodeBlock:
    case BlockType.CodeLine:
    case BlockType.HorizontalRule:
    case BlockType.Link:
    case BlockType.Mention:
    case BlockType.Emoticon:
    case BlockType.Command:
      return node;
    default:
      return node;
  }
};

export const rewriteSettingsLinksInDescendants = (
  children: Descendant[],
  baseUrl: string,
  isMarkdown = false
): Descendant[] => children.map((child) => rewriteNode(child, baseUrl, isMarkdown));
