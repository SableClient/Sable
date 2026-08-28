import { BlockType } from './types';

/** Editor-engine-neutral document stored by Sable drafts and serializers. */
export type EditorText = { text: string };
export type LinkToken = { type: BlockType.Link; href: string; children: EditorText[] };
export type MentionToken = {
  type: BlockType.Mention;
  id: string;
  eventId?: string;
  viaServers?: string[];
  highlight: boolean;
  name: string;
  children: EditorText[];
};
export type EmoticonToken = {
  type: BlockType.Emoticon;
  key: string;
  shortcode: string;
  children: EditorText[];
};
export type CommandToken = { type: BlockType.Command; command: string; children: EditorText[] };
export type InlineToken = EditorText | LinkToken | MentionToken | EmoticonToken | CommandToken;
export type EditorParagraph = { type: BlockType.Paragraph; children: InlineToken[] };
export type EditorDocument = EditorParagraph[];

export const isEditorText = (token: InlineToken | EditorParagraph): token is EditorText =>
  !('type' in token);
export const emptyEditorDocument = (): EditorDocument => [
  { type: BlockType.Paragraph, children: [{ text: '' }] },
];

export const getDocumentBeginCommand = (document: EditorDocument): string | undefined => {
  const paragraph = document[0];
  if (!paragraph) return undefined;
  for (const token of paragraph.children) {
    if (isEditorText(token) && token.text.trim() === '') continue;
    return !isEditorText(token) && token.type === BlockType.Command ? token.command : undefined;
  }
  return undefined;
};

export const editorDocumentText = (document: EditorDocument): string =>
  document
    .map((paragraph) =>
      paragraph.children
        .map((token) => {
          if (isEditorText(token)) return token.text;
          switch (token.type) {
            case BlockType.Link:
              return `[${token.children.map((child) => child.text).join('')}](${token.href})`;
            case BlockType.Mention:
              return token.name === '@room' ? token.name : token.id;
            case BlockType.Emoticon:
              return token.key.startsWith('mxc://') ? `:${token.shortcode}:` : token.key;
            case BlockType.Command:
              return `/${token.command}`;
            default:
              return '';
          }
        })
        .join('')
    )
    .join('\n');
