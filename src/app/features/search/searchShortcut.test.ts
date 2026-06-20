import { describe, expect, it } from 'vitest';
import { getMessageSearchShortcutPath, getSelectedSpaceIdOrAliasFromPath } from './searchShortcut';

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

  it('preserves search filters when already on a message search route', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/home/search/',
        currentSearch: '?rooms=%21room%3Asmoke.test&term=hello',
      })
    ).toBe('/home/search/?rooms=%21room%3Asmoke.test&term=hello');

    expect(
      getMessageSearchShortcutPath({
        pathname: '/%21space%3Asmoke.test/search',
        currentSearch: '?term=hello&grouped=false',
      })
    ).toBe('/%21space%3Asmoke.test/search?term=hello&grouped=false');
  });

  it('leaves unrelated routes alone', () => {
    expect(
      getMessageSearchShortcutPath({
        pathname: '/settings/general/',
      })
    ).toBeNull();
  });
});

describe('getSelectedSpaceIdOrAliasFromPath', () => {
  it('extracts the space id or alias from space routes', () => {
    expect(getSelectedSpaceIdOrAliasFromPath('/%21space%3Asmoke.test/lobby/')).toBe(
      '!space:smoke.test'
    );
    expect(getSelectedSpaceIdOrAliasFromPath('/%21space%3Asmoke.test/search')).toBe(
      '!space:smoke.test'
    );
    expect(
      getSelectedSpaceIdOrAliasFromPath('/%23space-alias%3Asmoke.test/%21room%3Asmoke.test/')
    ).toBe('#space-alias:smoke.test');
  });

  it('returns undefined for non-space routes', () => {
    expect(getSelectedSpaceIdOrAliasFromPath('/home/')).toBeUndefined();
    expect(getSelectedSpaceIdOrAliasFromPath('/settings')).toBeUndefined();
    expect(getSelectedSpaceIdOrAliasFromPath('/settings/general')).toBeUndefined();
  });
});
