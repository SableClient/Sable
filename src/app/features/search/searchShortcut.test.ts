import { describe, expect, it } from 'vitest';
import { getMessageSearchShortcutPath } from './searchShortcut';

describe('getMessageSearchShortcutPath', () => {
  it('routes home room shortcuts to room-scoped message search', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/home/%21room%3Asmoke.test/',
        currentRoomId: '!room:smoke.test',
      })
    ).toBe('/home/search/?rooms=%21room%3Asmoke.test');
  });

  it('routes direct room shortcuts to direct message search', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/direct/%21dm%3Asmoke.test/',
        currentRoomId: '!dm:smoke.test',
      })
    ).toBe('/direct/search/?rooms=%21dm%3Asmoke.test');
  });

  it('routes space lobby shortcuts to the current space search', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/%21space%3Asmoke.test/lobby/',
        selectedSpaceId: '!space:smoke.test',
      })
    ).toBe('/!space%3Asmoke.test/search');
  });

  it('routes space room shortcuts to the current room inside that space', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/%21space%3Asmoke.test/%21room%3Asmoke.test/',
        selectedSpaceId: '!space:smoke.test',
        currentRoomId: '!room:smoke.test',
      })
    ).toBe('/!space%3Asmoke.test/search?rooms=%21room%3Asmoke.test');
  });

  it('keeps home and direct roots searchable without a room filter', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/home/',
      })
    ).toBe('/home/search/');

    expect(
      getMessageSearchShortcutPath({
        pathname: '/direct/',
      })
    ).toBe('/direct/search/');
  });

  it('leaves unrelated routes alone', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/settings/general/',
      })
    ).toBeNull();
  });
});
