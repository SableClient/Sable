import { describe, expect, it } from 'vitest';
import { shouldIgnoreMessageLongPress } from './messageTouch';

describe('shouldIgnoreMessageLongPress', () => {
  it('keeps the message swipe wrapper eligible for long press', () => {
    const swipeWrapper = document.createElement('div');
    swipeWrapper.dataset.gestures = 'ignore';
    swipeWrapper.dataset.messageSwipe = '';
    const messageContent = document.createElement('span');
    swipeWrapper.append(messageContent);

    expect(shouldIgnoreMessageLongPress(messageContent)).toBe(false);
  });

  it('still ignores nested controls that own touch gestures', () => {
    const swipeWrapper = document.createElement('div');
    swipeWrapper.dataset.gestures = 'ignore';
    swipeWrapper.dataset.messageSwipe = '';
    const media = document.createElement('div');
    media.dataset.gestures = 'ignore';
    const mediaContent = document.createElement('img');
    media.append(mediaContent);
    swipeWrapper.append(media);

    expect(shouldIgnoreMessageLongPress(mediaContent)).toBe(true);
  });
});
