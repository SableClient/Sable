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
  const filtered = nodes.filter((n, i) => {
    if (isText(n) && /^\s*$/.test(n.data)) {
      const prev = nodes[i - 1];
      const next = nodes[i + 1];
      // Ignore whitespace between block tags or at the edges
      const isBetweenBlocks = (!prev || isBlockTag(prev)) && (!next || isBlockTag(next));
      if (isBetweenBlocks) return false;
    }
    return true;
  });

  const parts: string[] = [];
  for (let i = 0; i < filtered.length; i += 1) {
    const cur = filtered[i]!;
    const prev = filtered[i - 1];
    // Adjacent <p> blocks must become \n\n in markdown so the editor gets separate Slate
    // paragraphs and marked emits <p> per block again on send (single \n would collapse).
    if (
      i > 0 &&
      prev &&
      isTag(prev) &&
      isTag(cur) &&
      prev.name.toLowerCase() === 'p' &&
      cur.name.toLowerCase() === 'p'
    ) {
      parts.push('\n');
    }
    parts.push(processNode(cur));
  }
  return parts.join('');
}

function processNode(node: ChildNode, listDepth: number = 0, insideCode: boolean = false): string {
  if (isText(node)) {
    return insideCode ? node.data : escapeMarkdownInlineSequences(node.data);
  }

  if (!isTag(node)) {
    return '';
  }

  const tag = node.name.toLowerCase();

  // Handle Matrix-specific attributes
  if (tag === 'span') {
    if (node.attribs['data-mx-spoiler'] !== undefined) {
      return processSpoiler(node, listDepth, insideCode);
    }
    if (node.attribs['data-mx-maths'] !== undefined) {
      return processMath(node, 'inline');
    }
    if (node.attribs['data-md'] !== undefined) {
      return processInlineMarkdown(node, listDepth, insideCode);
    }
    if (
      node.attribs['data-mx-color'] !== undefined ||
      node.attribs['data-mx-bg-color'] !== undefined
    ) {
      return reconstructTag(node, listDepth, insideCode);
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
      return processHeading(node, tag, listDepth, insideCode);

    case 'p':
      return processParagraph(node, listDepth, insideCode);

    case 'strong':
    case 'b':
      return processInlineWrapper(node, '**', listDepth, insideCode);

    case 'em':
    case 'i':
      return processInlineWrapper(node, '*', listDepth, insideCode);

    case 'u': {
      const md = node.attribs['data-md'];
      return processInlineWrapper(node, md ?? '__');
    }

    case 's':
    case 'del':
      return processInlineWrapper(node, '~~', listDepth, insideCode);

    case 'code':
      return processCode(node, listDepth);

    case 'pre':
      return processPre(node, listDepth);

    case 'blockquote':
      return processBlockquote(node, listDepth, insideCode);

    case 'ul':
      return processUnorderedList(node, listDepth, insideCode);

    case 'ol':
      return processOrderedList(node, listDepth, insideCode);

    case 'li':
      return processListItem(node, listDepth, insideCode);

    case 'a':
      return processLink(node, listDepth, insideCode);

    case 'br':
      return '\n';

    case 'hr':
      return '---\n';

    case 'sub':
      return processSubscript(node, listDepth, insideCode);

    case 'img':
      return processImage(node);

    default:
      return processInlineElements(node, listDepth, insideCode);
  }
}
function reconstructTag(node: Element, listDepth: number = 0, insideCode: boolean = false): string {
  const content = processInlineElements(node, listDepth, insideCode);
  const attributes = Object.entries(node.attribs)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join('');
  return `<${node.name}${attributes}>${content}</${node.name}>`;
}

function processInlineElements(
  node: Element,
  listDepth: number = 0,
  insideCode: boolean = false
): string {
  return processChildren(node.children, listDepth, insideCode);
}

function processChildren(
  children: ChildNode[],
  listDepth: number = 0,
  insideCode: boolean = false
): string {
  const out: string[] = [];

  for (let i = 0; i < children.length; i += 1) {
    const cur = children[i];
    const next = children[i + 1];
    const next2 = children[i + 2];

    if (
      cur &&
      next &&
      next2 &&
      isText(cur) &&
      cur.data === '<' &&
      isTag(next) &&
      next.name.toLowerCase() === 'a' &&
      isText(next2) &&
      next2.data === '>'
    ) {
      const href = next.attribs.href ?? '';
      const content = next.children.map((c) => processNode(c, listDepth, insideCode)).join('');
      out.push(`[${content}](<${href}>)`);
      i += 2;
      continue;
    }

    if (cur) {
      out.push(processNode(cur, listDepth, insideCode));
    }
  }

  return out.join('');
}

function processInlineWrapper(
  node: Element,
  marker: string,
  listDepth: number = 0,
  insideCode: boolean = false
): string {
  const content = processChildren(node.children, listDepth, insideCode);
  return `${marker}${content}${marker}`;
}

function processCode(node: Element, listDepth: number = 0): string {
  const codeContent = node.children.map((c) => processNode(c, listDepth, true)).join('');

  // Check if this is inside a pre (code block)
  if (node.parent && isTag(node.parent) && node.parent.name === 'pre') {
    return codeContent;
  }

  // Single backtick for inline code
  return `\`${codeContent}\``;
}

function processPre(node: Element, listDepth: number = 0): string {
  // Get language from class="language-xxx"
  const codeChild = node.children.find((c): c is Element => isTag(c) && c.name === 'code');
  const className = codeChild?.attribs.class ?? '';
  const langMatch = className.match(/language-(\S+)/);
  const lang = langMatch ? langMatch[1] : '';

  const codeContent = codeChild
    ? codeChild.children.map((c) => processNode(c, listDepth, true)).join('')
    : node.children.map((c) => processNode(c, listDepth, true)).join('');

  return `\`\`\`${lang}\n${codeContent}\`\`\`\n`;
}

function processHeading(
  node: Element,
  tag: string,
  listDepth: number = 0,
  insideCode: boolean = false
): string {
  const level = tag.charAt(1);
  const content = processChildren(node.children, listDepth, insideCode);
  return `${'#'.repeat(parseInt(level, 10))} ${content}\n`;
}

function processParagraph(
  node: Element,
  listDepth: number = 0,
  insideCode: boolean = false
): string {
  const content = processChildren(node.children, listDepth, insideCode);
  return `${content}\n`;
}

function processBlockquote(
  node: Element,
  listDepth: number = 0,
  insideCode: boolean = false
): string {
  const content = node.children
    .map((child) => {
      if (isTag(child) && child.name === 'br') return '\n';
      const text = processNode(child, listDepth, insideCode);
      return text.replace(/\n/g, '\n> ');
    })
    .join('');
  return `> ${content}\n`;
}

/**
 * Process children of a list item, separating inline content from nested lists.
 * Nested lists are processed with increased depth for indentation.
 */
function processListItemChildren(li: Element, depth: number, insideCode: boolean = false): string {
  const inlineParts: string[] = [];
  const nestedParts: string[] = [];

  li.children.forEach((child) => {
    if (isTag(child) && (child.name === 'ul' || child.name === 'ol')) {
      // Nested list, process with increased depth
      nestedParts.push(processNode(child, depth + 1, insideCode));
    } else if (isTag(child) && child.name === 'p') {
      // Unwrap <p> inside <li>
      inlineParts.push(child.children.map((c) => processNode(c, depth, insideCode)).join(''));
    } else {
      inlineParts.push(processNode(child, depth, insideCode));
    }
  });

  let result = inlineParts.join('').trim();
  if (nestedParts.length > 0) {
    result += '\n' + nestedParts.join('').trimEnd();
  }
  return result;
}

function processUnorderedList(
  node: Element,
  depth: number = 0,
  insideCode: boolean = false
): string {
  const mdSequence = node.attribs['data-md'] || '-';
  const indent = '  '.repeat(depth);
  const items = node.children
    .filter((c): c is Element => isTag(c) && c.name === 'li')
    .map((li) => {
      const content = processListItemChildren(li, depth, insideCode);
      return `${indent}${mdSequence} ${content}`;
    })
    .join('\n');
  return items + '\n';
}

function processOrderedList(node: Element, depth: number = 0, insideCode: boolean = false): string {
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
      const content = processListItemChildren(li, depth, insideCode);
      return `${indent}${currentPrefix} ${content}`;
    })
    .join('\n');
  return items + '\n';
}

function processListItem(node: Element, listDepth = 0, insideCode = false): string {
  const content = node.children
    .map((child) => {
      if (isTag(child) && child.name === 'p') {
        return child.children.map((c) => processNode(c, listDepth, insideCode)).join('');
      }
      return processNode(child, listDepth, insideCode);
    })
    .join('');
  return `- ${content}\n`;
}

function processSubscript(node: Element, listDepth = 0, insideCode = false): string {
  const content = node.children.map((c) => processNode(c, listDepth, insideCode)).join('');
  return `-# ${content}\n`;
}

function processLink(node: Element, listDepth = 0, insideCode = false): string {
  const href = node.attribs.href ?? '';
  const content = node.children.map((c) => processNode(c, listDepth, insideCode)).join('');
  return `[${content}](${href})`;
}

function processSpoiler(node: Element, listDepth = 0, insideCode = false): string {
  const content = node.children.map((c) => processNode(c, listDepth, insideCode)).join('');
  return `||${content}||`;
}

function processMath(node: Element, mode: 'inline' | 'block'): string {
  const latex = node.attribs['data-mx-maths'] ?? '';
  if (mode === 'block') {
    return `$$${latex}$$`;
  }
  return `$${latex}$`;
}

function processInlineMarkdown(
  node: Element,
  listDepth: number = 0,
  insideCode: boolean = false
): string {
  const mdSequence = node.attribs['data-md'] ?? '';
  const content = node.children.map((c) => processNode(c, listDepth, insideCode)).join('');
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
