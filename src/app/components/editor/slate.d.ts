import type { BaseEditor } from 'slate';
import type { ReactEditor } from 'slate-react';
import type { HistoryEditor } from 'slate-history';
import type { BlockType } from './types';

export type Editor = BaseEditor & HistoryEditor & ReactEditor;

export type Text = {
  text: string;
};

export type FormattedText = Text;

export type LinkElement = {
  type: BlockType.Link;
  href: string;
  children: Text[];
};

export type MentionElement = {
  type: BlockType.Mention;
  id: string;
  eventId?: string;
  viaServers?: string[];
  highlight: boolean;
  name: string;
  children: Text[];
};
export type EmoticonElement = {
  type: BlockType.Emoticon;
  key: string;
  shortcode: string;
  children: Text[];
};
export type CommandElement = {
  type: BlockType.Command;
  command: string;
  children: Text[];
};

export type InlineElement =
  | FormattedText
  | LinkElement
  | MentionElement
  | EmoticonElement
  | CommandElement;

export type ParagraphElement = {
  type: BlockType.Paragraph;
  children: InlineElement[];
};

export type CustomElement =
  | LinkElement
  | MentionElement
  | EmoticonElement
  | CommandElement
  | ParagraphElement;

declare module 'slate' {
  interface CustomTypes {
    Editor: Editor;
    Element: CustomElement;
    Text: FormattedText;
  }
}
