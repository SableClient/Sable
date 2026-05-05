import parse from 'html-dom-parser';
import type { ChildNode, Element } from 'domhandler';
import { isText, isTag } from 'domhandler';
import {
  encodeMxEmoticonForMarkdownPlaceholder,
  validateMxcUrl,
} from './extensions/matrix-emoticon';
import { escapeMarkdownInlineSequences } from './utils';

/**
 * Converts Matrix-compatible HTML back to markdown for round-trip editing.
 * Preserves original markdown syntax via data-md attributes and converts
 * Matrix-specific elements (spoilers, math) back to their markdown equivalents.
 *
 * @param html - Input HTML string (should be pre-sanitized)
 * @returns Markdown string for editor editing
 */
export function htmlToMarkdown(html: string): string {
  const domNodes = parse(html);
  return processNodes(domNodes).trim();
}

function isBlockTag(node: ChildNode | undefined): boolean {
  if (!node || !isTag(node)) return false;
  const blocks = [
    'p',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'hr',
    'table',
    'details',
    'summary',
  ];
  return blocks.includes(node.name.toLowerCase());
}

function processNodes(nodes: ChildNode[]): string {
  return nodes
    .filter((n, i) => {
      if (isText(n) && /^\s*$/.test(n.data)) {
        const prev = nodes[i - 1];
        const next = nodes[i + 1];
        // Ignore whitespace between block tags or at the edges
        const isBetweenBlocks = (!prev || isBlockTag(prev)) && (!next || isBlockTag(next));
        if (isBetweenBlocks) return false;
      }
      return true;
    })
    .map((n) => processNode(n))
    .join('');
}

function processNode(node: ChildNode, listDepth: number = 0): string {
  if (isText(node)) {
    return escapeMarkdownInlineSequences(node.data);
  }

  if (!isTag(node)) {
    return '';
  }

  const tag = node.name.toLowerCase();

  // Handle Matrix-specific attributes
  if (tag === 'span') {
    if (node.attribs['data-mx-spoiler'] !== undefined) {
      return processSpoiler(node);
    }
    if (node.attribs['data-mx-maths'] !== undefined) {
      return processMath(node, 'inline');
    }
    if (node.attribs['data-md'] !== undefined) {
      return processInlineMarkdown(node);
    }
    if (
      node.attribs['data-mx-color'] !== undefined ||
      node.attribs['data-mx-bg-color'] !== undefined
    ) {
      return reconstructTag(node);
    }
  }

  if (tag === 'div') {
    if (node.attribs['data-mx-maths'] !== undefined) {
      return processMath(node, 'block');
    }
  }

  // Handle block elements
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return processHeading(node, tag);

    case 'p':
      return processParagraph(node);

    case 'strong':
    case 'b':
      return processInlineWrapper(node, '**');

    case 'em':
    case 'i':
      return processInlineWrapper(node, '*');

    case 'u':
      return processInlineWrapper(node, '_');

    case 's':
    case 'del':
      return processInlineWrapper(node, '~~');

    case 'code':
      return processCode(node);

    case 'pre':
      return processPre(node);

    case 'blockquote':
      return processBlockquote(node);

    case 'ul':
      return processUnorderedList(node, listDepth);

    case 'ol':
      return processOrderedList(node, listDepth);

    case 'li':
      return processListItem(node);

    case 'a':
      return processLink(node);

    case 'br':
      return '\n';

    case 'hr':
      return '---\n';

    case 'sub':
      return processSubscript(node);

    case 'img':
      return processImage(node);

    default:
      return processInlineElements(node);
  }
}
function reconstructTag(node: Element): string {
  const content = processInlineElements(node);
  const attributes = Object.entries(node.attribs)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
  return `<${node.name}${attributes}>${content}</${node.name}>`;
}

function processInlineElements(node: Element): string {
  return node.children.map((c) => processNode(c)).join('');
}

function processInlineWrapper(node: Element, marker: string): string {
  const content = node.children.map((c) => processNode(c)).join('');
  return `${marker}${content}${marker}`;
}

function processCode(node: Element): string {
  const codeContent = node.children.map((c) => processNode(c)).join('');

  // Check if this is inside a pre (code block)
  if (node.parent && isTag(node.parent) && node.parent.name === 'pre') {
    return codeContent;
  }

  // Single backtick for inline code
  return `\`${codeContent}\``;
}

function processPre(node: Element): string {
  // Get language from class="language-xxx"
  const codeChild = node.children.find((c): c is Element => isTag(c) && c.name === 'code');
  const className = codeChild?.attribs.class ?? '';
  const langMatch = className.match(/language-(\S+)/);
  const lang = langMatch ? langMatch[1] : '';

  const codeContent = codeChild
    ? codeChild.children.map((c) => processNode(c)).join('')
    : node.children.map((c) => processNode(c)).join('');

  return `\`\`\`${lang}\n${codeContent}\`\`\`\n`;
}

function processHeading(node: Element, tag: string): string {
  const level = tag.charAt(1);
  const content = node.children.map((c) => processNode(c)).join('');
  return `${'#'.repeat(parseInt(level, 10))} ${content}\n`;
}

function processParagraph(node: Element): string {
  const content = node.children.map((c) => processNode(c)).join('');
  return `${content}\n`;
}

function processBlockquote(node: Element): string {
  const content = node.children
    .map((child) => {
      if (isTag(child) && child.name === 'br') return '\n';
      const text = processNode(child);
      return text.replace(/\n/g, '\n> ');
    })
    .join('');
  return `> ${content}\n`;
}

/**
 * Process children of a list item, separating inline content from nested lists.
 * Nested lists are processed with increased depth for indentation.
 */
function processListItemChildren(li: Element, depth: number): string {
  const inlineParts: string[] = [];
  const nestedParts: string[] = [];

  li.children.forEach((child) => {
    if (isTag(child) && (child.name === 'ul' || child.name === 'ol')) {
      // Nested list, process with increased depth
      nestedParts.push(processNode(child, depth + 1));
    } else if (isTag(child) && child.name === 'p') {
      // Unwrap <p> inside <li>
      inlineParts.push(child.children.map((c) => processNode(c)).join(''));
    } else {
      inlineParts.push(processNode(child));
    }
  });

  let result = inlineParts.join('').trim();
  if (nestedParts.length > 0) {
    result += '\n' + nestedParts.join('').trimEnd();
  }
  return result;
}

function processUnorderedList(node: Element, depth: number = 0): string {
  const mdSequence = node.attribs['data-md'] || '-';
  const indent = '  '.repeat(depth);
  const items = node.children
    .filter((c): c is Element => isTag(c) && c.name === 'li')
    .map((li) => {
      const content = processListItemChildren(li, depth);
      return `${indent}${mdSequence} ${content}`;
    })
    .join('\n');
  return items + '\n';
}

function processOrderedList(node: Element, depth: number = 0): string {
  const mdSequence = node.attribs['data-md'] || '1.';
  const [starOrHyphen] = mdSequence.match(/^\*|-$/) ?? [];
  const outPrefix = starOrHyphen
    ? starOrHyphen
    : mdSequence.endsWith('.')
      ? mdSequence
      : `${mdSequence}.`;

  const indent = '  '.repeat(depth);
  const items = node.children
    .filter((c): c is Element => isTag(c) && c.name === 'li')
    .map((li, index) => {
      let currentPrefix = outPrefix;
      if (!starOrHyphen) {
        const start = parseInt(node.attribs.start || mdSequence, 10);
        if (!isNaN(start)) {
          currentPrefix = `${start + index}.`;
        }
      }
      const content = processListItemChildren(li, depth);
      return `${indent}${currentPrefix} ${content}`;
    })
    .join('\n');
  return items + '\n';
}

function processListItem(node: Element): string {
  const content = node.children
    .map((child) => {
      if (isTag(child) && child.name === 'p') {
        return child.children.map((c) => processNode(c)).join('');
      }
      return processNode(child);
    })
    .join('');
  return `- ${content}\n`;
}

function processSubscript(node: Element): string {
  const content = node.children.map((c) => processNode(c)).join('');
  return `-# ${content}\n`;
}

function processLink(node: Element): string {
  const href = node.attribs.href ?? '';
  const content = node.children.map((c) => processNode(c)).join('');
  return `[${content}](${href})`;
}

function processSpoiler(node: Element): string {
  const content = node.children.map((c) => processNode(c)).join('');
  return `||${content}||`;
}

function processMath(node: Element, mode: 'inline' | 'block'): string {
  const latex = node.attribs['data-mx-maths'] ?? '';
  if (mode === 'block') {
    return `$$${latex}$$`;
  }
  return `$${latex}$`;
}

function processInlineMarkdown(node: Element): string {
  const mdSequence = node.attribs['data-md'] ?? '';
  const content = node.children.map((c) => processNode(c)).join('');
  return `${mdSequence}${content}${mdSequence}`;
}

function processImage(node: Element): string {
  if (node.attribs['data-mx-emoticon'] === undefined) {
    return '';
  }

  const src = node.attribs.src ?? '';
  const alt = node.attribs.alt ?? node.attribs.title ?? '';

  if (!validateMxcUrl(src)) {
    return '';
  }

  const shortcode = alt.replace(/^:|:$/g, '');
  if (!shortcode) {
    return '';
  }

  return encodeMxEmoticonForMarkdownPlaceholder(src, shortcode);
}
