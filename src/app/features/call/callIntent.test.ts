import { describe, expect, it } from 'vitest';
import {
  normalizeCallIntent,
  toCallNotificationType,
  toCallNotificationTypeOrDefault,
} from './callIntent';

describe('callIntent', () => {
  describe('normalizeCallIntent', () => {
    it('prefers explicit intent kind', () => {
      expect(normalizeCallIntent('video', 'start_call_dm_voice')).toBe('video');
      expect(normalizeCallIntent('audio', 'start_call_dm_video')).toBe('audio');
    });

    it('infers voice and video from intent raw string', () => {
      expect(normalizeCallIntent(undefined, 'start_call_dm_voice')).toBe('audio');
      expect(normalizeCallIntent(undefined, 'start_call_dm_video')).toBe('video');
    });

    it('defaults DM start without voice/video markers to audio', () => {
      expect(normalizeCallIntent(undefined, 'start_call_dm')).toBe('audio');
    });
  });

  describe('toCallNotificationType', () => {
    it('accepts ring and notification only', () => {
      expect(toCallNotificationType('ring')).toBe('ring');
      expect(toCallNotificationType('notification')).toBe('notification');
      expect(toCallNotificationType('invalid')).toBeUndefined();
    });

    it('defaults missing push types to ring', () => {
      expect(toCallNotificationTypeOrDefault(undefined)).toBe('ring');
      expect(toCallNotificationTypeOrDefault('notification')).toBe('notification');
    });
  });
});
