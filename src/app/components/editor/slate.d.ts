// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- required for declare module augmentation
import { BaseEditor } from 'slate';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- required for declare module augmentation
import { ReactEditor } from 'slate-react';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- required for declare module augmentation
import { HistoryEditor } from 'slate-history';
import { type BlockType } from './types';

export type HeadingLevel = 1 | 2 | 3;

export type Editor = BaseEditor & HistoryEditor & ReactEditor;

export type Text = {
  text: string;
};

export type FormattedText = Text & {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeThrough?: boolean;
  code?: boolean;
  spoiler?: boolean;
};

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

export type InlineElement = Text | LinkElement | MentionElement | EmoticonElement | CommandElement;

export type ParagraphElement = {
  type: BlockType.Paragraph;
  children: InlineElement[];
};
export type HeadingElement = {
  type: BlockType.Heading;
  level: HeadingLevel;
  children: InlineElement[];
};
export type CodeLineElement = {
  type: BlockType.CodeLine;
  children: Text[];
};
export type CodeBlockElement = {
  type: BlockType.CodeBlock;
  children: CodeLineElement[];
};
export type QuoteLineElement = {
  type: BlockType.QuoteLine;
  children: InlineElement[];
};
export type BlockQuoteElement = {
  type: BlockType.BlockQuote;
  children: QuoteLineElement[];
};
export type ListItemElement = {
  type: BlockType.ListItem;
  children: InlineElement[];
};
export type OrderedListElement = {
  type: BlockType.OrderedList;
  children: ListItemElement[];
};
export type UnorderedListElement = {
  type: BlockType.UnorderedList;
  children: ListItemElement[];
};

export type SmallElement = {
  type: BlockType.Small;
  children: InlineElement[];
};

export type HorizontalRuleElement = {
  type: BlockType.HorizontalRule;
  children: Text[];
};

export type CustomElement =
  | LinkElement
  | MentionElement
  | EmoticonElement
  | CommandElement
  | ParagraphElement
  | HeadingElement
  | CodeLineElement
  | CodeBlockElement
  | QuoteLineElement
  | BlockQuoteElement
  | ListItemElement
  | OrderedListElement
  | UnorderedListElement
  | SmallElement
  | HorizontalRuleElement;

declare module 'slate' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interface required for declaration merging in module augmentation
  interface CustomTypes {
    Editor: Editor;
    Element: CustomElement;
    Text: FormattedText & Text;
  }
}
