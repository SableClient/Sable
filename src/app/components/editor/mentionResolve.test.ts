import { describe, expect, it } from 'vitest';
import type { Room } from '$types/matrix-sdk';
import {
  formatMentionElementDisplayName,
  formatUserMentionDisplayName,
  mentionNameForUserAutocomplete,
  resolveUserMentionName,
} from './utils';
import { BlockType } from './types';

const roomWithMember = (userId: string, rawDisplayName: string): Room =>
  ({
    getMember: (id: string) =>
      id === userId ? ({ userId: id, rawDisplayName } as never) : undefined,
  }) as unknown as Room;

describe('mention resolve', () => {
  it('resolveUserMentionName uses room membership and adds @', () => {
    const room = roomWithMember('@alice:example.org', 'Alice');
    expect(resolveUserMentionName('@alice:example.org', { room })).toBe('@Alice');
  });

  it('formatMentionElementDisplayName adds @ to legacy mention nodes without prefix', () => {
    expect(
      formatMentionElementDisplayName({
        type: BlockType.Mention,
        id: '@alice:example.org',
        name: 'Alice',
        highlight: true,
        children: [{ text: '' }],
      })
    ).toBe('@Alice');
  });

  it('formatUserMentionDisplayName is idempotent for names that already include @', () => {
    expect(formatUserMentionDisplayName('@Alice')).toBe('@Alice');
  });

  it('mentionNameForUserAutocomplete keeps @room for room pings', () => {
    expect(mentionNameForUserAutocomplete('!room:example.org', '@room')).toBe('@room');
    expect(mentionNameForUserAutocomplete('!room:example.org', '@room')).not.toBe(
      '@!room:example.org'
    );
  });
});
