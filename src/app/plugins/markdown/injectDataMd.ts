/**
 * Injects data-md attributes into HTML to preserve markdown syntax for round-trip editing.
 * This is used when receiving HTML from a sender that may not have preserved data-md.
 *
 * The function identifies common HTML patterns and adds the appropriate data-md attribute
 * so that when converting back to markdown, the original syntax is preserved.
 *
 * @param html - Input HTML string
 * @returns HTML string with data-md attributes injected
 */
export function injectDataMd(html: string): string {
  // Inject heading data-md (e.g., <h1 data-md="#">)
  html = html.replace(/<h([1-6])([^>]*)>/g, (_, level, attrs) => {
    if (attrs.includes('data-md')) return `<h${level}${attrs}>`;
    const hashes = '#'.repeat(parseInt(level, 10));
    return `<h${level} data-md="${hashes}"${attrs}>`;
  });

  // Inject blockquote data-md
  html = html.replace(/<blockquote([^>]*)>/g, (_, attrs) => {
    if (attrs.includes('data-md')) return `<blockquote${attrs}>`;
    return `<blockquote data-md=">"${attrs}>`;
  });

  // Inject code block data-md
  html = html.replace(/<pre([^>]*)><code([^>]*)>/g, (_, preAttrs, codeAttrs) => {
    if (preAttrs.includes('data-md')) return `<pre${preAttrs}><code${codeAttrs}>`;
    return `<pre data-md="\`\`\`"${preAttrs}><code${codeAttrs}>`;
  });

  // Inject horizontal rule data-md
  html = html.replace(/<hr([^>]*)>/g, (_, attrs) => {
    if (attrs.includes('data-md')) return `<hr${attrs}>`;
    return `<hr data-md="---"${attrs}>`;
  });

  // Inject subscript data-md
  html = html.replace(/<sub([^>]*)>/g, (_, attrs) => {
    if (attrs.includes('data-md')) return `<sub${attrs}>`;
    return `<sub data-md="-#"${attrs}>`;
  });

  // Inject ordered list data-md
  html = html.replace(/<ol([^>]*)>/g, (_, attrs) => {
    if (attrs.includes('data-md')) return `<ol${attrs}>`;
    return `<ol data-md="1."${attrs}>`;
  });

  // Inject unordered list data-md
  html = html.replace(/<ul([^>]*)>/g, (_, attrs) => {
    if (attrs.includes('data-md')) return `<ul${attrs}>`;
    return `<ul data-md="-"${attrs}>`;
  });

  // Inject inline markdown markers for strong/bold
  html = html.replace(/<strong([^>]*)>([^<]*)<\/strong>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<strong${attrs}>${content}</strong>`;
    return `<strong data-md="**"${attrs}>${content}</strong>`;
  });
  html = html.replace(/<b([^>]*)>([^<]*)<\/b>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<b${attrs}>${content}</b>`;
    return `<b data-md="**"${attrs}>${content}</b>`;
  });

  // Inject inline markdown markers for emphasis/italic
  html = html.replace(/<em([^>]*)>([^<]*)<\/em>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<em${attrs}>${content}</em>`;
    return `<em data-md="*"${attrs}>${content}</em>`;
  });
  html = html.replace(/<i([^>]*)>([^<]*)<\/i>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<i${attrs}>${content}</i>`;
    return `<i data-md="*"${attrs}>${content}</i>`;
  });

  // Inject inline markdown markers for underline
  html = html.replace(/<u([^>]*)>([^<]*)<\/u>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<u${attrs}>${content}</u>`;
    return `<u data-md="__"${attrs}>${content}</u>`;
  });

  // Inject inline markdown markers for strikethrough
  html = html.replace(/<s([^>]*)>([^<]*)<\/s>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<s${attrs}>${content}</s>`;
    return `<s data-md="~~"${attrs}>${content}</s>`;
  });
  html = html.replace(/<del([^>]*)>([^<]*)<\/del>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<del${attrs}>${content}</del>`;
    return `<del data-md="~~"${attrs}>${content}</del>`;
  });

  // Inject inline code marker
  html = html.replace(/<code([^>]*)>([^<]*)<\/code>/g, (_, attrs, content) => {
    if (attrs.includes('data-md')) return `<code${attrs}>${content}</code>`;
    // Don't add data-md for inline code inside pre (code blocks handled separately)
    if (content.includes('\n')) return `<code${attrs}>${content}</code>`;
    return `<code data-md="\`"${attrs}>${content}</code>`;
  });

  return html;
}
