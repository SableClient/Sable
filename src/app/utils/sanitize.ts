import DOMPurify from 'dompurify';
import { isMatrixHexColor } from './matrixHtml';

const MAX_TAG_NESTING = 100;
const INTERNAL_IMG_SRC_ATTR = 'data-sable-img-src';

const permittedHtmlTags = [
  'del',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'p',
  'a',
  'ul',
  'ol',
  'sup',
  'sub',
  'li',
  'b',
  'i',
  'u',
  'strong',
  'em',
  's',
  'code',
  'hr',
  'br',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'caption',
  'pre',
  'span',
  'img',
  'details',
  'summary',
] as const;

const permittedTagToAttributes = {
  span: ['data-mx-bg-color', 'data-mx-color', 'data-mx-spoiler', 'data-mx-maths', 'data-md'],
  a: ['target', 'href', 'data-md'],
  img: ['width', 'height', 'alt', 'title', 'src', 'data-mx-emoticon'], // data-mx-emoticon is for MSC2545
  ol: ['start', 'data-md'],
  ul: ['data-md'],
  code: ['class', 'data-md', 'data-lang'],
  pre: ['class', 'data-md', 'data-lang'],
  div: ['data-mx-maths'],
  blockquote: ['data-md'],
  h1: ['data-md'],
  h2: ['data-md'],
  h3: ['data-md'],
  h4: ['data-md'],
  h5: ['data-md'],
  h6: ['data-md'],
  strong: ['data-md'],
  i: ['data-md'],
  em: ['data-md'],
  u: ['data-md'],
  s: ['data-md'],
  del: ['data-md'],
  sub: ['data-md'],
  hr: ['data-md'],
} as const satisfies Record<string, readonly string[]>;

const permittedHtmlAttributes = Array.from(new Set(Object.values(permittedTagToAttributes).flat()));

const allowedLinkSchemes = new Set(['https', 'http', 'ftp', 'mailto', 'magnet']);
const forbiddenContentTags = ['mx-reply', 'script', 'style', 'textarea', 'option', 'noscript'];

const codeLanguageClassRegex = /^language-[A-Za-z0-9_-]+$/;
const orderedListStartRegex = /^-?\d+$/;
const allowedUriRegex = /^(?:https?|ftp|mailto|magnet|mxc):/i;

export function sanitizeText(body: string): string {
  const tagsToReplace: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return body.replace(/[&<>'"]/g, (tag) => tagsToReplace[tag] || tag);
}

function tagAllowsAttribute(tagName: string, attrName: string): boolean {
  const allowedAttributes =
    permittedTagToAttributes[tagName as keyof typeof permittedTagToAttributes];

  return allowedAttributes ? (allowedAttributes as readonly string[]).includes(attrName) : false;
}

function isAllowedAbsoluteLink(value: string): boolean {
  try {
    const parsed = new URL(value);
    return allowedLinkSchemes.has(parsed.protocol.slice(0, -1));
  } catch {
    return false;
  }
}

function isAllowedMxcUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'mxc:' &&
      parsed.host.length > 0 &&
      parsed.pathname.length > 1 &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

function normalizeCodeClasses(attrValue: string): string | undefined {
  const classes = attrValue.split(/\s+/).filter(Boolean);
  if (
    classes.length === 0 ||
    classes.some((className) => !codeLanguageClassRegex.test(className))
  ) {
    return undefined;
  }

  return classes.join(' ');
}

function getValidatedAttributeValue(
  tagName: string,
  attrName: string,
  attrValue: string
): string | undefined {
  if (attrName === 'style') {
    return undefined;
  }

  if (
    (attrName === 'data-mx-color' || attrName === 'data-mx-bg-color') &&
    !isMatrixHexColor(attrValue)
  ) {
    return undefined;
  }

  if (tagName === 'a' && attrName === 'href' && !isAllowedAbsoluteLink(attrValue)) {
    return undefined;
  }

  if (tagName === 'img' && attrName === 'src' && !isAllowedMxcUri(attrValue)) {
    return undefined;
  }

  if (tagName === 'ol' && attrName === 'start' && !orderedListStartRegex.test(attrValue)) {
    return undefined;
  }

  if ((tagName === 'code' || tagName === 'pre') && attrName === 'class') {
    return normalizeCodeClasses(attrValue);
  }

  return attrValue;
}

function getValidatedProtectedImageSource(
  sourceId: string | null,
  protectedSources?: Map<string, string>
): string | undefined {
  const rawSrc = sourceId ? protectedSources?.get(sourceId) : undefined;

  return typeof rawSrc === 'string' ? getValidatedAttributeValue('img', 'src', rawSrc) : undefined;
}

function protectImageSources(customHtml: string): {
  protectedHtml: string;
  protectedSources: Map<string, string>;
} {
  const protectedSources = new Map<string, string>();
  const protectedHtml = customHtml.replace(/<img\b[^>]*>/gi, (imgTag) => {
    let protectedSourceId: string | undefined;

    const strippedTag = imgTag.replace(
      /\s(src|srcset)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
      (_match, attrName: string, _value, doubleQuoted, singleQuoted, bareValue) => {
        if (attrName.toLowerCase() !== 'src') {
          return '';
        }

        if (protectedSourceId !== undefined) {
          return '';
        }

        const rawSrc = doubleQuoted ?? singleQuoted ?? bareValue ?? '';
        protectedSourceId = `${protectedSources.size}`;
        protectedSources.set(protectedSourceId, rawSrc);

        return ` ${INTERNAL_IMG_SRC_ATTR}="${protectedSourceId}"`;
      }
    );

    return strippedTag;
  });

  return {
    protectedHtml,
    protectedSources,
  };
}

function restoreProtectedImageSources(
  sanitizedHtml: string,
  protectedSources: Map<string, string>
): string {
  return sanitizedHtml.replace(
    new RegExp(`\\s${INTERNAL_IMG_SRC_ATTR}="([^"]+)"`, 'g'),
    (_match, sourceId: string) => {
      const validatedSrc = getValidatedProtectedImageSource(sourceId, protectedSources);
      if (!validatedSrc) return '';

      return ` src="${sanitizeText(validatedSrc)}"`;
    }
  );
}

const enforceNestingLimit = (fragment: DocumentFragment): void => {
  const overlyNestedElements: Array<{ depth: number; element: Element }> = [];

  const collect = (node: ParentNode, depth: number) => {
    Array.from(node.childNodes).forEach((child) => {
      if (!(child instanceof Element)) return;

      const childDepth = depth + 1;
      if (childDepth > MAX_TAG_NESTING) {
        overlyNestedElements.push({ depth: childDepth, element: child });
      }

      collect(child, childDepth);
    });
  };

  collect(fragment, 0);

  overlyNestedElements
    .toSorted((a, b) => b.depth - a.depth)
    .forEach(({ element }) => {
      if (!element.parentNode) return;
      element.replaceWith(...Array.from(element.childNodes));
    });
};

const pruneInvalidEmptyElements = (
  fragment: DocumentFragment,
  protectedSources?: Map<string, string>
): void => {
  fragment.querySelectorAll('img').forEach((img) => {
    const validatedProtectedSource = getValidatedProtectedImageSource(
      img.getAttribute(INTERNAL_IMG_SRC_ATTR),
      protectedSources
    );

    if (!img.getAttribute('src') && !validatedProtectedSource) {
      img.remove();
    }
  });
};

export const sanitizeCustomHtml = (customHtml: string): string => {
  if (typeof window === 'undefined') {
    return sanitizeText(customHtml);
  }

  const { protectedHtml, protectedSources } = protectImageSources(customHtml);
  const purify = DOMPurify(window);
  const allowedHtmlAttributes = [...permittedHtmlAttributes, INTERNAL_IMG_SRC_ATTR];

  purify.addHook('uponSanitizeAttribute', (currentNode, hookEvent) => {
    const tagName = currentNode.tagName.toLowerCase();
    const attrName = hookEvent.attrName.toLowerCase();

    if (tagName === 'img' && attrName === INTERNAL_IMG_SRC_ATTR) {
      if (!protectedSources.has(hookEvent.attrValue)) {
        hookEvent.keepAttr = false;
        return;
      }

      hookEvent.forceKeepAttr = true;
      return;
    }

    if (!tagAllowsAttribute(tagName, attrName)) {
      // DOMPurify exposes attribute decisions by mutating the hook event.
      hookEvent.keepAttr = false;
      return;
    }

    const validatedAttrValue = getValidatedAttributeValue(tagName, attrName, hookEvent.attrValue);
    if (validatedAttrValue === undefined) {
      hookEvent.keepAttr = false;
      return;
    }

    hookEvent.attrValue = validatedAttrValue;
    hookEvent.forceKeepAttr = true;
  });

  const sanitizedNode = purify.sanitize(protectedHtml, {
    ALLOWED_TAGS: [...permittedHtmlTags],
    ALLOWED_ATTR: allowedHtmlAttributes,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: true,
    FORBID_ATTR: ['style'],
    FORBID_TAGS: ['mx-reply'],
    FORBID_CONTENTS: forbiddenContentTags,
    KEEP_CONTENT: true,
    ALLOWED_URI_REGEXP: allowedUriRegex,
    RETURN_DOM_FRAGMENT: true,
  });

  if (!(sanitizedNode instanceof window.DocumentFragment)) {
    return sanitizeText(customHtml);
  }

  const fragment = sanitizedNode;
  enforceNestingLimit(fragment);
  pruneInvalidEmptyElements(fragment, protectedSources);

  const container = document.createElement('div');
  container.append(fragment);
  return restoreProtectedImageSources(container.innerHTML, protectedSources);
};
