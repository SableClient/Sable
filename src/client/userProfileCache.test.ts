import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '$hooks/useUserProfile';
import {
  clearCachedUserProfiles,
  readCachedUserProfiles,
  writeCachedUserProfiles,
} from './userProfileCache';

describe('userProfileCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores recently fetched profiles as fresh', () => {
    writeCachedUserProfiles(
      '@me:example.org',
      {
        '@alice:example.org': {
          displayName: 'Alice',
          avatarUrl: 'mxc://example.org/avatar',
          _fetched: true,
          _fetchedAt: 100,
        },
      },
      100
    );

    expect(readCachedUserProfiles('@me:example.org', 200)).toEqual({
      '@alice:example.org': {
        displayName: 'Alice',
        avatarUrl: 'mxc://example.org/avatar',
        _fetched: true,
        _fetchedAt: 100,
      },
    });
  });

  it('marks an individual profile stale after ten minutes', () => {
    writeCachedUserProfiles(
      '@me:example.org',
      { '@alice:example.org': { displayName: 'Alice', _fetched: true, _fetchedAt: 100 } },
      100
    );

    expect(readCachedUserProfiles('@me:example.org', 10 * 60 * 1000 + 100)).toEqual({
      '@alice:example.org': {
        displayName: 'Alice',
        _fetched: false,
        _fetchedAt: 100,
      },
    });
  });

  it('keeps caches isolated by signed-in account', () => {
    writeCachedUserProfiles('@one:example.org', { '@alice:example.org': { displayName: 'One' } });
    writeCachedUserProfiles('@two:example.org', { '@alice:example.org': { displayName: 'Two' } });

    expect(readCachedUserProfiles('@one:example.org')['@alice:example.org']?.displayName).toBe(
      'One'
    );
    expect(readCachedUserProfiles('@two:example.org')['@alice:example.org']?.displayName).toBe(
      'Two'
    );
  });

  it('ignores expired and malformed cache entries', () => {
    writeCachedUserProfiles(
      '@me:example.org',
      { '@alice:example.org': { displayName: 'Alice' } },
      0
    );
    expect(readCachedUserProfiles('@me:example.org', 31 * 24 * 60 * 60 * 1000)).toEqual({});

    localStorage.setItem('sable.userProfiles.v3.%40me%3Aexample.org', '{broken');
    expect(readCachedUserProfiles('@me:example.org')).toEqual({});
  });

  it('does not persist empty fetch markers', () => {
    writeCachedUserProfiles('@me:example.org', {
      '@missing:example.org': { _fetched: true, _fetchedAt: 100 },
      '@alice:example.org': { displayName: 'Alice', _fetched: true, _fetchedAt: 100 },
    });

    expect(readCachedUserProfiles('@me:example.org')).toEqual({
      '@alice:example.org': { displayName: 'Alice', _fetched: false, _fetchedAt: 100 },
    });
  });

  it('treats storage failures as a cache miss', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('disabled');
    });
    expect(readCachedUserProfiles('@me:example.org')).toEqual({});
    getItem.mockRestore();
  });

  it('bounds the number of persisted profiles', () => {
    const profiles: Record<string, UserProfile> = {};
    for (let index = 0; index < 1005; index += 1) {
      profiles[`@user${index}:example.org`] = { displayName: `User ${index}` };
    }

    writeCachedUserProfiles('@me:example.org', profiles);
    const restored = readCachedUserProfiles('@me:example.org');
    expect(Object.keys(restored)).toHaveLength(1000);
    expect(restored['@user0:example.org']).toBeUndefined();
    expect(restored['@user1004:example.org']?.displayName).toBe('User 1004');
  });

  it('clears only the requested account cache', () => {
    writeCachedUserProfiles('@one:example.org', { '@alice:example.org': { displayName: 'One' } });
    writeCachedUserProfiles('@two:example.org', { '@alice:example.org': { displayName: 'Two' } });

    clearCachedUserProfiles('@one:example.org');

    expect(readCachedUserProfiles('@one:example.org')).toEqual({});
    expect(readCachedUserProfiles('@two:example.org')['@alice:example.org']?.displayName).toBe(
      'Two'
    );
  });
});
