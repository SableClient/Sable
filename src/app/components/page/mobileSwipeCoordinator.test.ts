import { describe, expect, it } from 'vitest';
import { classifyMobileGesture, getDrawerSettlePosition } from './mobileSwipeCoordinator';

const width = 400;

describe('classifyMobileGesture', () => {
  it('gives a rightward room gesture to the drawer', () => {
    expect(
      classifyMobileGesture({
        distanceX: 20,
        distanceY: 2,
        startPosition: -width,
        width,
        canOpenRoom: true,
        hasMessage: true,
        hasChat: true,
      })
    ).toBe('drawer');
  });

  it('gives a leftward room gesture to the message before the chat', () => {
    expect(
      classifyMobileGesture({
        distanceX: -20,
        distanceY: 2,
        startPosition: -width,
        width,
        canOpenRoom: true,
        hasMessage: true,
        hasChat: true,
      })
    ).toBe('message');
  });

  it('uses the chat action away from a message', () => {
    expect(
      classifyMobileGesture({
        distanceX: -20,
        distanceY: 2,
        startPosition: -width,
        width,
        canOpenRoom: true,
        hasMessage: false,
        hasChat: true,
      })
    ).toBe('chat');
  });

  it('opens the last room when swiping left from the list', () => {
    expect(
      classifyMobileGesture({
        distanceX: -20,
        distanceY: 2,
        startPosition: 0,
        width,
        canOpenRoom: true,
        hasMessage: false,
        hasChat: false,
      })
    ).toBe('drawer');
  });

  it('leaves vertical scrolling native', () => {
    expect(
      classifyMobileGesture({
        distanceX: 5,
        distanceY: 20,
        startPosition: -width,
        width,
        canOpenRoom: true,
        hasMessage: true,
        hasChat: true,
      })
    ).toBe('vertical');
  });
});

describe('getDrawerSettlePosition', () => {
  it('commits a sufficiently long back swipe', () => {
    expect(
      getDrawerSettlePosition({
        startPosition: -width,
        distanceX: 100,
        velocityX: 0.1,
        width,
        cancelled: false,
      })
    ).toBe(0);
  });

  it('commits a fast back flick', () => {
    expect(
      getDrawerSettlePosition({
        startPosition: -width,
        distanceX: 20,
        velocityX: 0.6,
        width,
        cancelled: false,
      })
    ).toBe(0);
  });

  it('returns to the room after an incomplete gesture', () => {
    expect(
      getDrawerSettlePosition({
        startPosition: -width,
        distanceX: 20,
        velocityX: 0.1,
        width,
        cancelled: false,
      })
    ).toBe(-width);
  });

  it('returns to the starting panel when cancelled', () => {
    expect(
      getDrawerSettlePosition({
        startPosition: -width,
        distanceX: 200,
        velocityX: 1,
        width,
        cancelled: true,
      })
    ).toBe(-width);
  });
});
