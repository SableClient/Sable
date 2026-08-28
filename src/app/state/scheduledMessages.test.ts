import { createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import {
  getScheduledMessageStateKey,
  roomIdToEditingScheduledDelayIdAtomFamily,
  roomIdToScheduledTimeAtomFamily,
} from './scheduledMessages';

describe('scheduled message state', () => {
  it('isolates the same room across accounts', () => {
    const store = createStore();
    const aliceKey = getScheduledMessageStateKey('@alice:example.org', '!room:example.org');
    const bobKey = getScheduledMessageStateKey('@bob:example.org', '!room:example.org');

    store.set(roomIdToScheduledTimeAtomFamily(aliceKey), new Date(1_000));
    store.set(roomIdToEditingScheduledDelayIdAtomFamily(aliceKey), 'alice-delay');

    expect(store.get(roomIdToScheduledTimeAtomFamily(bobKey))).toBeNull();
    expect(store.get(roomIdToEditingScheduledDelayIdAtomFamily(bobKey))).toBeNull();
  });
});
