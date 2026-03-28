import sanitizeHtml, { Transformer } from 'sanitize-html';

const MAX_TAG_NESTING = 100;

// Allowed tags per Matrix spec v1.18 (https://spec.matrix.org/v1.18/client-server-api/#mroommessage-msgtypes)
const permittedHtmlTags = [
  'a',
  'b',
  'i',
  'u',
  'strong',
  'em',
  'del',
  'blockquote',
  'code',
  'pre',
  'p',
  'span',
  'br',
  'ul',
  'ol',
  'li',
  'sup',
  'sub',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'caption',
  'img',
];

// Only allow http, https, matrix, mxc for href/src
const urlSchemes = ['https', 'http', 'matrix', 'mxc'];

// Allowed attributes per tag, per Matrix spec v1.18
const permittedTagToAttributes = {
  a: ['href'],
  img: ['src', 'alt', 'title'],
  code: ['class'],
  span: [
    'data-mx-spoiler',
    'data-mx-pill',
    'data-mx-maths',
    'data-mx-bg-color',
    'data-mx-color',
    'style', // Only color/background-color allowed
  ],
  // Allow style/color on b, i, u, strong, em, del, blockquote, p, h1-h6, li, th, td, caption, pre, sup, sub, hr, table, thead, tbody, tr
  b: ['style'],
  i: ['style'],
  u: ['style'],
  strong: ['style'],
  em: ['style'],
  del: ['style'],
  blockquote: ['style'],
  p: ['style'],
  h1: ['style'],
  h2: ['style'],
  h3: ['style'],
  h4: ['style'],
  h5: ['style'],
  h6: ['style'],
  li: ['style'],
  th: ['style'],
  td: ['style'],
  caption: ['style'],
  pre: ['style'],
  sup: ['style'],
  sub: ['style'],
  hr: ['style'],
  table: ['style'],
  thead: ['style'],
  tbody: ['style'],
  tr: ['style'],
};

// Remove font tag support (not in spec)
// Only allow color/background-color in style, and only if valid hex or named color
const transformSpanTag: Transformer = (tagName, attribs) => {
  const allowedStyles: Record<string, string> = {};
  if (attribs.style) {
    // Only allow color/background-color
    const style = attribs.style.split(';').map((s) => s.trim());
    style.forEach((s) => {
      if (s.startsWith('color:')) allowedStyles.color = s.split(':')[1].trim();
      if (s.startsWith('background-color:'))
        allowedStyles['background-color'] = s.split(':')[1].trim();
    });
  }
  // Prefer data-mx-color/bg-color if present
  if (attribs['data-mx-color']) allowedStyles.color = attribs['data-mx-color'];
  if (attribs['data-mx-bg-color']) allowedStyles['background-color'] = attribs['data-mx-bg-color'];
  return {
    tagName,
    attribs: {
      ...attribs,
      style: Object.entries(allowedStyles)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; '),
    },
  };
};

const transformATag: Transformer = (tagName, attribs) => {
  // Only allow http, https, matrix: links
  const href = attribs.href || '';
  if (!href.match(/^(https?:|matrix:)/)) {
    // attribs must include all possible keys as strings
    return { tagName: 'span', attribs: { href: '', rel: '', target: '' }, text: href };
  }
  return {
    tagName,
    attribs: {
      href: href || '',
      rel: 'noreferrer noopener',
      target: '_blank',
    },
  };
};

const transformImgTag: Transformer = (tagName, attribs) => {
  // Only allow mxc:// URLs for src
  const src = typeof attribs.src === 'string' ? attribs.src : '';
  if (!src.startsWith('mxc://')) {
    // Replace with alt text or nothing
    return {
      tagName: 'span',
      attribs: { src: '', alt: '', title: '' },
      text: typeof attribs.alt === 'string' ? attribs.alt : '',
    };
  }
  return {
    tagName,
    attribs: {
      src: src || '',
      alt: typeof attribs.alt === 'string' ? attribs.alt : '',
      title: typeof attribs.title === 'string' ? attribs.title : '',
    },
  };
};

export const sanitizeCustomHtml = (customHtml: string): string =>
  sanitizeHtml(customHtml, {
    allowedTags: permittedHtmlTags,
    allowedAttributes: permittedTagToAttributes,
    disallowedTagsMode: 'discard',
    allowedSchemes: urlSchemes,
    allowedSchemesByTag: {
      a: urlSchemes,
      img: ['mxc'],
    },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    allowedClasses: {
      code: ['language-*'],
    },
    allowedStyles: {
      '*': {
        color: [/^#(?:[0-9a-fA-F]{3}){1,2}$/],
        'background-color': [/^#(?:[0-9a-fA-F]{3}){1,2}$/],
      },
    },
    transformTags: {
      span: transformSpanTag,
      a: transformATag,
      img: transformImgTag,
    },
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'mx-reply'],
    nestingLimit: MAX_TAG_NESTING,
  });

export const sanitizeText = (body: string) => {
  const tagsToReplace: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return body.replace(/[&<>'"]/g, (tag) => tagsToReplace[tag] || tag);
};
