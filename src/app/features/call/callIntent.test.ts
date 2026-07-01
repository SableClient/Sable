import { describe, expect, it } from 'vitest';
import { ElementCallIntent } from '$plugins/call/types';
import {
  normalizeCallIntent,
  toCallNotificationType,
  toCallNotificationTypeOrDefault,
} from './callIntent';

describe('callIntent', () => {
  describe('normalizeCallIntent', () => {
    it('prefers explicit intent kind', () => {
      expect(normalizeCallIntent('video', 'start_call_dm_voice')).toBe('video');
      expect(normalizeCallIntent('audio', 'start_call_dm')).toBe('audio');
    });

    it('maps Element Call voice intents to audio', () => {
      expect(normalizeCallIntent(undefined, ElementCallIntent.StartCallDMVoice)).toBe('audio');
      expect(normalizeCallIntent(undefined, ElementCallIntent.JoinExistingVoice)).toBe('audio');
    });

    it('maps Element Call non-voice intents to video', () => {
      expect(normalizeCallIntent(undefined, ElementCallIntent.StartCallDM)).toBe('video');
      expect(normalizeCallIntent(undefined, ElementCallIntent.JoinExisting)).toBe('video');
      expect(normalizeCallIntent(undefined, ElementCallIntent.StartCall)).toBe('video');
    });

    it('defaults unknown intents to audio', () => {
      expect(normalizeCallIntent(undefined, undefined)).toBe('audio');
      expect(normalizeCallIntent(undefined, 'unknown_intent')).toBe('audio');
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
