import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('../../utils/debugLogger', () => ({
  createDebugLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { CallEmbed } from './CallEmbed';
import { ElementCallIntent } from './types';

type IntentCase = {
  dm: boolean;
  ongoing: boolean;
  video: boolean;
  expected: string;
};

const intentCases: IntentCase[] = [
  { dm: true, ongoing: false, video: true, expected: ElementCallIntent.StartCallDM },
  { dm: true, ongoing: false, video: false, expected: ElementCallIntent.StartCallDMVoice },
  { dm: true, ongoing: true, video: true, expected: ElementCallIntent.JoinExistingDM },
  { dm: true, ongoing: true, video: false, expected: ElementCallIntent.JoinExistingDMVoice },
  { dm: false, ongoing: false, video: true, expected: ElementCallIntent.StartCall },
  { dm: false, ongoing: false, video: false, expected: ElementCallIntent.StartCallVoice },
  { dm: false, ongoing: true, video: true, expected: ElementCallIntent.JoinExisting },
  { dm: false, ongoing: true, video: false, expected: ElementCallIntent.JoinExistingVoice },
];

describe('CallEmbed.getIntent', () => {
  it.each(intentCases)('maps dm=$dm ongoing=$ongoing video=$video to $expected', (tc) => {
    const intent = CallEmbed.getIntent(tc.dm, tc.ongoing, tc.video);
    expect(intent).toBe(tc.expected);
  });
});

describe('CallEmbed.dmCall', () => {
  it.each([
    ElementCallIntent.StartCallDM,
    ElementCallIntent.StartCallDMVoice,
    ElementCallIntent.JoinExistingDM,
    ElementCallIntent.JoinExistingDMVoice,
  ])('returns true for DM intent %s', (intent) => {
    expect(CallEmbed.dmCall(intent)).toBe(true);
  });

  it.each([
    ElementCallIntent.StartCall,
    ElementCallIntent.StartCallVoice,
    ElementCallIntent.JoinExisting,
    ElementCallIntent.JoinExistingVoice,
  ])('returns false for room intent %s', (intent) => {
    expect(CallEmbed.dmCall(intent)).toBe(false);
  });
});

describe('CallEmbed.startingCall', () => {
  it.each([
    ElementCallIntent.StartCall,
    ElementCallIntent.StartCallVoice,
    ElementCallIntent.StartCallDM,
    ElementCallIntent.StartCallDMVoice,
  ])('returns true for start intent %s', (intent) => {
    expect(CallEmbed.startingCall(intent)).toBe(true);
  });

  it.each([
    ElementCallIntent.JoinExisting,
    ElementCallIntent.JoinExistingVoice,
    ElementCallIntent.JoinExistingDM,
    ElementCallIntent.JoinExistingDMVoice,
  ])('returns false for join intent %s', (intent) => {
    expect(CallEmbed.startingCall(intent)).toBe(false);
  });
});

describe('CallEmbed.getWidget', () => {
  vi.stubGlobal('window', {
    location: { origin: 'https://app.example.com' },
  });

  const mx = {
    baseUrl: 'https://matrix.example.com',
    getSafeUserId: () => '@alice:example.com',
    getDeviceId: () => 'ALICEDEVICE',
  } as never;

  const createRoom = (isCallRoom: boolean) =>
    ({
      roomId: '!room:example.com',
      hasEncryptionStateEvent: () => false,
      isCallRoom: () => isCallRoom,
    }) as never;

  it('adds ring notification delegation for starting DM calls in non-call rooms', () => {
    const room = createRoom(false);
    const widget = CallEmbed.getWidget(mx, room, ElementCallIntent.StartCallDMVoice, 'dark');
    const url = new URL(widget.getCompleteUrl({ currentUserId: '@alice:example.com' }));

    expect(url.searchParams.get('sendNotificationType')).toBe('ring');
  });

  it('adds notification delegation for starting room calls in non-call rooms', () => {
    const room = createRoom(false);
    const widget = CallEmbed.getWidget(mx, room, ElementCallIntent.StartCallVoice, 'dark');
    const url = new URL(widget.getCompleteUrl({ currentUserId: '@alice:example.com' }));

    expect(url.searchParams.get('sendNotificationType')).toBe('notification');
  });

  it('does not add notification delegation for join intents', () => {
    const room = createRoom(false);
    const widget = CallEmbed.getWidget(mx, room, ElementCallIntent.JoinExisting, 'dark');
    const url = new URL(widget.getCompleteUrl({ currentUserId: '@alice:example.com' }));

    expect(url.searchParams.get('sendNotificationType')).toBeNull();
  });

  it('does not add notification delegation in call rooms', () => {
    const room = createRoom(true);
    const widget = CallEmbed.getWidget(mx, room, ElementCallIntent.StartCallDM, 'dark');
    const url = new URL(widget.getCompleteUrl({ currentUserId: '@alice:example.com' }));

    expect(url.searchParams.get('sendNotificationType')).toBeNull();
  });
});
