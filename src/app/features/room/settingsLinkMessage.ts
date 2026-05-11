import { find as findLinks } from 'linkifyjs';
import type { Descendant } from 'slate';
import { Text } from 'slate';
import type { FormattedText, InlineElement, ParagraphElement } from '$components/editor/slate';
import { BlockType } from '$components/editor/types';
import {
  createLinkElement,
  getMarkdownCodeSpanRanges,
  isInsideMarkdownCodeSpan,
} from '$components/editor/utils';
import { getSettingsLinkLabel, parseSettingsLink } from '$features/settings/settingsLink';

type RewritableSettingsLinkMatch = {
  end: number;
  href: string;
  label: string;
  start: number;
};

const isMarkdownSettingsLink = (text: string, start: number, end: number): boolean =>
  text.slice(0, start).endsWith('](') && text.slice(end).startsWith(')');

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
  codeSpanRanges: [number, number][]
): boolean =>
  isMarkdownSettingsLink(text, start, end) ||
  isInsideMarkdownCodeSpan(start, end, codeSpanRanges) ||
  isMarkdownAutolink(text, start, end) ||
  isInsideHtmlTag(text, start);

const getRewritableSettingsLinkMatches = (
  text: string,
  baseUrl: string
): RewritableSettingsLinkMatch[] => {
  const matches = findLinks(text, 'url');
  if (matches.length === 0) return [];

  const codeSpanRanges = getMarkdownCodeSpanRanges(text);
  return matches.flatMap((match) => {
    const href = match.value;
    const settingsLink = parseSettingsLink(baseUrl, href);

    if (!settingsLink || isProtectedMarkdownContext(text, match.start, match.end, codeSpanRanges)) {
      return [];
    }

    return [
      {
        end: match.end,
        href,
        label: getSettingsLinkLabel(settingsLink.section, settingsLink.focus),
        start: match.start,
      },
    ];
  });
};

const hasRewritableSettingsLinksInInlineChildren = (
  children: InlineElement[],
  baseUrl: string
): boolean =>
  children.some(
    (child) =>
      Text.isText(child) && getRewritableSettingsLinkMatches(child.text, baseUrl).length > 0
  );

const createTextSegment = (node: FormattedText, text: string): FormattedText => ({
  ...node,
  text,
});

const rewriteInlineText = (node: FormattedText, baseUrl: string): InlineElement[] => {
  const matches = getRewritableSettingsLinkMatches(node.text, baseUrl);
  if (matches.length === 0) return [node];

  const rewritten: InlineElement[] = [];
  let cursor = 0;

  matches.forEach((match) => {
    if (cursor < match.start) {
      rewritten.push(createTextSegment(node, node.text.slice(cursor, match.start)));
    }

    rewritten.push(createLinkElement(match.href, [createTextSegment(node, match.label)]));
    cursor = match.end;
  });

  if (rewritten.length === 0) return [node];

  if (cursor < node.text.length) {
    rewritten.push(createTextSegment(node, node.text.slice(cursor)));
  }

  return rewritten.filter((child) => !Text.isText(child) || child.text.length > 0);
};

const rewriteInlineChildren = (children: InlineElement[], baseUrl: string): InlineElement[] =>
  children.flatMap((child) => (Text.isText(child) ? rewriteInlineText(child, baseUrl) : [child]));

const rewriteInlineContainer = (node: ParagraphElement, baseUrl: string): ParagraphElement => ({
  ...node,
  children: rewriteInlineChildren(node.children, baseUrl),
});

const hasSettingsLinksToRewriteInNode = (node: Descendant, baseUrl: string): boolean => {
  if (Text.isText(node)) {
    return getRewritableSettingsLinkMatches(node.text, baseUrl).length > 0;
  }

  switch (node.type) {
    case BlockType.Paragraph:
      return hasRewritableSettingsLinksInInlineChildren(node.children, baseUrl);
    default:
      return false;
  }
};

const rewriteNode = (node: Descendant, baseUrl: string): Descendant => {
  if (Text.isText(node)) return node;

  switch (node.type) {
    case BlockType.Paragraph:
      return rewriteInlineContainer(node, baseUrl);
    default:
      return node;
  }
};

export const hasSettingsLinksToRewrite = (nodes: Descendant[], baseUrl: string): boolean =>
  nodes.some((node) => hasSettingsLinksToRewriteInNode(node, baseUrl));

export const rewriteSettingsLinks = (nodes: Descendant[], baseUrl: string): Descendant[] =>
  nodes.map((node) => rewriteNode(node, baseUrl));
