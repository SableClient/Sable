import { type Cursor } from './Cursor';

export type Operations = {
  select(cursor: Cursor): void;
  deselect(cursor: Cursor): void;
  insert(cursor: Cursor, text: string): Cursor;
};
