import { describe, expect, it } from 'vitest';
import {
  selectPersistedSessionCandidate,
  shouldClearMediaCacheAfterSessionRemoval,
  type ServiceWorkerSessionInfo,
} from './sw-session-state';

const makeSession = (
  accessToken: string,
  userId: string,
  overrides: Partial<ServiceWorkerSessionInfo> = {}
): ServiceWorkerSessionInfo => ({
  accessToken,
  baseUrl: `https://${userId.slice(1)}`,
  userId,
  ...overrides,
});

describe('selectPersistedSessionCandidate', () => {
  it('returns the first live session when one exists', () => {
    const first = makeSession('token-a', '@alice:smoke.test');
    const second = makeSession('token-b', '@bob:smoke.test');

    expect(selectPersistedSessionCandidate([first, second])).toEqual(first);
  });

  it('returns undefined when there are no live sessions', () => {
    expect(selectPersistedSessionCandidate([])).toBeUndefined();
  });
});

describe('shouldClearMediaCacheAfterSessionRemoval', () => {
  it('keeps the shared media cache when another live session still uses the token', () => {
    const sessions = [
      makeSession('shared-token', '@alice:smoke.test'),
      makeSession('shared-token', '@alice-alt:smoke.test'),
    ];

    expect(shouldClearMediaCacheAfterSessionRemoval('shared-token', sessions)).toBe(false);
  });

  it('clears the shared media cache when the removed token is no longer live', () => {
    const sessions = [makeSession('different-token', '@bob:smoke.test')];

    expect(shouldClearMediaCacheAfterSessionRemoval('shared-token', sessions)).toBe(true);
  });
});
