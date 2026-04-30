import parse from 'html-dom-parser';
import type { ChildNode, Element } from 'domhandler';
import { isText, isTag } from 'domhandler';
import { validateMxcUrl } from './extensions/matrix-emoticon';
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
  return processNodes(domNodes);
}

function processNodes(nodes: ChildNode[]): string {
  return nodes.map(processNode).join('');
}

function processNode(node: ChildNode): string {
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
      return processUnorderedList(node);

    case 'ol':
      return processOrderedList(node);

    case 'li':
      return processListItem(node);

    case 'a':
      return processLink(node);

    case 'br':
      return '\n';

    case 'hr':
      return '\n---\n';

    case 'sub':
      return processSubscript(node);

    case 'img':
      return processImage(node);

    default:
      return processInlineElements(node);
  }
}

function processInlineElements(node: Element): string {
  return node.children.map(processNode).join('');
}

function processInlineWrapper(node: Element, marker: string): string {
  const content = node.children.map(processNode).join('');
  return `${marker}${content}${marker}`;
}

function processCode(node: Element): string {
  const codeContent = node.children.map(processNode).join('');

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
    ? codeChild.children.map(processNode).join('')
    : node.children.map(processNode).join('');

  return `\`\`\`${lang}\n${codeContent}\`\`\``;
}

function processHeading(node: Element, tag: string): string {
  const level = tag.charAt(1);
  const content = node.children.map(processNode).join('');
  return `\n${'#'.repeat(parseInt(level, 10))} ${content}\n`;
}

function processParagraph(node: Element): string {
  const content = node.children.map(processNode).join('');
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

function processUnorderedList(node: Element): string {
  const mdSequence = node.attribs['data-md'] || '-';
  const items = node.children
    .filter((c): c is Element => isTag(c) && c.name === 'li')
    .map((li) => {
      const content = li.children.map(processNode).join('').trim();
      return `${mdSequence} ${content}\n`;
    })
    .join('');
  return items;
}

function processOrderedList(node: Element): string {
  const mdSequence = node.attribs['data-md'] || '1.';
  const [starOrHyphen] = mdSequence.match(/^\*|-$/) ?? [];
  const outPrefix = starOrHyphen
    ? starOrHyphen
    : mdSequence.endsWith('.')
      ? mdSequence
      : `${mdSequence}.`;

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
      const content = li.children.map(processNode).join('').trim();
      return `${currentPrefix} ${content}\n`;
    })
    .join('');
  return items;
}

function processListItem(node: Element): string {
  const content = node.children
    .map((child) => {
      if (isTag(child) && child.name === 'p') {
        return child.children.map(processNode).join('');
      }
      return processNode(child);
    })
    .join('');
  return `- ${content}\n`;
}

function processSubscript(node: Element): string {
  const content = node.children.map(processNode).join('');
  return `-# ${content}\n`;
}

function processLink(node: Element): string {
  const href = node.attribs.href ?? '';
  const content = node.children.map(processNode).join('');
  return `[${content}](${href})`;
}

function processSpoiler(node: Element): string {
  const content = node.children.map(processNode).join('');
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
  const content = node.children.map(processNode).join('');
  return `${mdSequence}${content}${mdSequence}`;
}

function processImage(node: Element): string {
  if (node.attribs['data-mx-emoticon'] === undefined) {
    return '';
  }

  const src = node.attribs.src ?? '';
  const alt = node.attribs.alt ?? '';

  if (!validateMxcUrl(src)) {
    return '';
  }

  return `<img data-mx-emoticon src="${src}" alt="${alt}" />`;
}
