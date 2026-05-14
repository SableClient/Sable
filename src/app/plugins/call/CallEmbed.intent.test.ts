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
  { dm: false, ongoing: false, video: false, expected: 'start_call_voice' },
  { dm: false, ongoing: true, video: true, expected: ElementCallIntent.JoinExisting },
  { dm: false, ongoing: true, video: false, expected: 'join_existing_voice' },
];

describe('CallEmbed.getIntent', () => {
  it.each(intentCases)('maps dm=$dm ongoing=$ongoing video=$video to $expected', (tc) => {
    const intent = CallEmbed.getIntent(tc.dm, tc.ongoing, tc.video);
    expect(intent).toBe(tc.expected);
  });
});
