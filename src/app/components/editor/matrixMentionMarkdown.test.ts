import { describe, expect, it } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import { plainToEditorInput } from './input';
import { BlockType } from './types';
import { htmlToMarkdown } from '$plugins/markdown';
import {
  expandMatrixMentionMarkdownInText,
  mentionFromMatrixToMarkdownLink,
} from './matrixMentionMarkdown';

const roomWithMember = (userId: string, rawDisplayName: string): Room =>
  ({
    getMember: (id: string) =>
      id === userId ? ({ userId: id, rawDisplayName } as never) : undefined,
  }) as unknown as Room;

describe('matrixMentionMarkdown', () => {
  it('recognizes matrix.to user permalinks as mentions with @ display name', () => {
    const room = roomWithMember('@alice:example.org', 'Alice');
    const el = mentionFromMatrixToMarkdownLink('Alice', 'https://matrix.to/#/@alice:example.org', {
      room,
    });
    expect(el).toMatchObject({
      type: BlockType.Mention,
      id: '@alice:example.org',
      name: '@Alice',
    });
  });

  it('expands markdown matrix.to user links into Mention elements', () => {
    const room = roomWithMember('@alice:example.org', 'Alice');
    const parts = expandMatrixMentionMarkdownInText(
      'hi [Alice](https://matrix.to/#/@alice:example.org)!',
      { room }
    );
    expect(parts).toEqual([
      { text: 'hi ' },
      expect.objectContaining({
        type: BlockType.Mention,
        id: '@alice:example.org',
        name: '@Alice',
      }),
      { text: '!' },
    ]);
  });

  it('expands preview-suppressed matrix.to mention links from corrupted edits', () => {
    const parts = expandMatrixMentionMarkdownInText(
      'hi [Alice](<https://matrix.to/#/@alice:example.org>)!'
    );
    expect(parts[1]).toMatchObject({
      type: BlockType.Mention,
      id: '@alice:example.org',
    });
  });

  it('plainToEditorInput round-trips formatted_body user mentions', () => {
    const room = roomWithMember('@alice:example.org', 'Alice');
    const md = htmlToMarkdown(
      '<p>Hello <a href="https://matrix.to/#/@alice:example.org">Alice</a>!</p>'
    );
    const doc = plainToEditorInput(md, { room });
    const paragraph = doc[0] as { children: unknown[] };
    expect(paragraph.children).toEqual([
      { text: 'Hello ' },
      expect.objectContaining({
        type: BlockType.Mention,
        id: '@alice:example.org',
        name: '@Alice',
      }),
      { text: '!' },
    ]);
  });

  it('does not treat regular https links as mentions', () => {
    const parts = expandMatrixMentionMarkdownInText('[site](https://example.org/)');
    expect(parts).toEqual([{ text: '[site](https://example.org/)' }]);
  });
});
