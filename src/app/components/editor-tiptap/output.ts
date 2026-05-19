/**
 * Tiptap output serializer — converts a Tiptap editor's document to the formats
 * required by the Matrix spec (custom HTML for formatted_body, plain text for body).
 *
 * Approach: walk the ProseMirror JSON tree, emit markdown-like text for formatted
 * content, then run it through the existing markdownToHtml() pipeline so that the
 * output is identical in structure to the Slate-based serializer.
 */

import type { Editor as TiptapEditorInstance, JSONContent } from '@tiptap/core';
import type { Room } from '$types/matrix-sdk';
import { sanitizeText } from '$utils/sanitize';
import { markdownToHtml, injectDataMd } from '$plugins/markdown';
import { getMxIdLocalPart, isUserId } from '$utils/matrix';
import { getMemberDisplayName } from '$utils/room';
import { MATRIX_TO_BASE } from '$plugins/matrix-to';

export type TiptapOutputOptions = {
  forEmote?: boolean;
  room?: Room;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const escapeMarkdownInline = (text: string): string =>
  // Escape characters that could accidentally trigger markdown formatting
  text.replace(/([\\`*_~[\]])/g, '\\$1');

function userMentionLabel(userId: string, room: Room | undefined): string {
  const fallback = getMxIdLocalPart(userId) ?? userId;
  if (!room) return fallback;
  const fromMembership = getMemberDisplayName(room, userId);
  if (!fromMembership) return fallback;
  const t = fromMembership.trim();
  if (!t || t.includes(']')) return fallback;
  for (let i = 0; i < t.length; i++) {
    if (t.charCodeAt(i) <= 0x1f) return fallback;
  }
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Node → markdown text
// ─────────────────────────────────────────────────────────────────────────────

function marksForNode(node: JSONContent): {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
} {
  const marks: Record<string, boolean> = {};
  for (const m of node.marks ?? []) {
    if (typeof m === 'string') marks[m] = true;
    else marks[m.type] = true;
  }
  return marks;
}

function inlineNodeToMarkdown(node: JSONContent, opts: TiptapOutputOptions): string {
  switch (node.type) {
    case 'text': {
      let text = node.text ?? '';
      const { bold, italic, strike, code } = marksForNode(node);

      if (code) {
        // Don't escape inside code spans
        return `\`${text}\``;
      }

      text = escapeMarkdownInline(text);
      if (bold) text = `**${text}**`;
      if (italic) text = `*${text}*`;
      if (strike) text = `~~${text}~~`;
      return text;
    }

    case 'mention': {
      const { id, nodeType, viaServers, eventId } = node.attrs ?? {};
      if (!id) return '';

      let fragment = String(id);
      if (eventId) fragment += `/${String(eventId)}`;
      if (viaServers && (viaServers as string[]).length > 0)
        fragment += `?${(viaServers as string[]).map((s) => `via=${s}`).join('&')}`;

      const matrixTo = `${MATRIX_TO_BASE}#/${fragment}`;

      if (id === '@room') return `[@room](${encodeURI(matrixTo)})`;
      if (nodeType === 'user' || isUserId(String(id))) {
        const mdLabel = userMentionLabel(String(id), opts.room);
        return `[${mdLabel}](${encodeURI(matrixTo)})`;
      }
      return sanitizeText(matrixTo);
    }

    case 'emoticon': {
      const { key, shortcode } = node.attrs ?? {};
      if (!key) return '';
      if (String(key).startsWith('mxc://')) {
        return `<img data-mx-emoticon src="${sanitizeText(String(key))}" alt="${sanitizeText(String(shortcode ?? ''))}" title="${sanitizeText(String(shortcode ?? ''))}" height="32" />`;
      }
      return sanitizeText(String(key));
    }

    case 'command': {
      const { command } = node.attrs ?? {};
      return `/${sanitizeText(String(command ?? ''))}`;
    }

    case 'hardBreak':
      return '\n';

    default:
      return '';
  }
}

function paragraphToMarkdown(paragraph: JSONContent, opts: TiptapOutputOptions): string {
  const parts = (paragraph.content ?? []).map((n) => inlineNodeToMarkdown(n, opts));
  return parts.join('');
}

function docToMarkdown(doc: JSONContent, opts: TiptapOutputOptions): string {
  const paragraphs = doc.content ?? [];
  const lines = paragraphs.map((p) => {
    if (p.type === 'paragraph') return paragraphToMarkdown(p, opts);
    return '';
  });
  // Join with newline; trailing newline will be stripped by trimCustomHtml
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Tiptap editor's content to Matrix custom HTML (formatted_body).
 */
export function tiptapToMatrixCustomHTML(
  editor: TiptapEditorInstance,
  opts: TiptapOutputOptions = {}
): string {
  const doc = editor.getJSON() as unknown as JSONContent;
  const markdown = docToMarkdown(doc, opts);
  const html = markdownToHtml(markdown, { emote: opts.forEmote });
  return injectDataMd(html);
}

/**
 * Convert a Tiptap editor's content to a plain-text string (body).
 */
export function tiptapToPlainText(editor: TiptapEditorInstance): string {
  const doc = editor.getJSON() as unknown as JSONContent;
  const paragraphs = doc.content ?? [];
  const lines = paragraphs.map((p) => {
    if (p.type !== 'paragraph') return '';
    return (p.content ?? [])
      .map((n) => {
        switch (n.type) {
          case 'text':
            return n.text ?? '';
          case 'mention':
            return n.attrs?.id === '@room' ? '@room' : String(n.attrs?.id ?? '');
          case 'emoticon': {
            const { key, shortcode } = n.attrs ?? {};
            if (!key) return '';
            return String(key).startsWith('mxc://') ? `:${String(shortcode ?? '')}:` : String(key);
          }
          case 'command':
            return `/${String(n.attrs?.command ?? '')}`;
          case 'hardBreak':
            return '\n';
          default:
            return '';
        }
      })
      .join('');
  });
  return lines.join('\n').replace(/\n$/, '');
}

/**
 * Returns true when the HTML and plain-text representations are equivalent
 * (i.e., no actual formatting — just send plain text).
 */
export function tiptapCustomHtmlEqualsPlainText(
  editor: TiptapEditorInstance,
  opts: TiptapOutputOptions = {}
): boolean {
  const plain = tiptapToPlainText(editor);
  const html = tiptapToMatrixCustomHTML(editor, opts);
  // Strip HTML tags and compare
  const stripped = html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
  return stripped.trim() === plain.trim();
}
