import { describe, it, expect } from 'vitest';
import {
  daysToMs,
  hour12to24,
  hour24to12,
  hoursToMs,
  inSameDay,
  minuteDifference,
  minutesToMs,
  secondsToMs,
} from './time';

describe('hour24to12', () => {
  it.each([
    [0, 12], // midnight → 12 AM
    [1, 1],
    [11, 11],
    [12, 12], // noon → 12 PM
    [13, 1],
    [23, 11],
  ])('hour24to12(%i) → %i', (input, expected) => {
    expect(hour24to12(input)).toBe(expected);
  });
});

describe('hour12to24', () => {
  it.each([
    [12, true, 12], // 12 PM → 12
    [12, false, 0], // 12 AM → 0 (midnight)
    [1, true, 13], // 1 PM → 13
    [1, false, 1], // 1 AM → 1
    [11, true, 23], // 11 PM → 23
    [11, false, 11], // 11 AM → 11
  ])('hour12to24(%i, pm=%s) → %i', (hour, pm, expected) => {
    expect(hour12to24(hour, pm)).toBe(expected);
  });
});

describe('inSameDay', () => {
  // Use noon UTC for all timestamps so the local calendar date is unambiguous
  // in any timezone (avoids midnight UTC being the previous day locally).
  const base = new Date('2024-01-15T12:00:00Z').getTime();
  const sameDay = new Date('2024-01-15T14:00:00Z').getTime();
  const nextDay = new Date('2024-01-16T12:00:00Z').getTime();

  it('returns true for two timestamps on the same day', () => {
    expect(inSameDay(base, sameDay)).toBe(true);
  });

  it('returns false for timestamps on different days', () => {
    expect(inSameDay(base, nextDay)).toBe(false);
  });

  it('returns true when both timestamps are identical', () => {
    expect(inSameDay(base, base)).toBe(true);
  });
});

describe('minuteDifference', () => {
  it.each([
    [0, 60_000, 1], // 1 minute
    [0, 3_600_000, 60], // 1 hour = 60 minutes
    [0, 90_000, 1], // 1.5 minutes rounds to 1 - always rounds down now
    [5_000, 0, 0], // less than a minute → 0
    [0, 0, 0], // same timestamp
  ])('minuteDifference(%i, %i) → %i', (ts1, ts2, expected) => {
    expect(minuteDifference(ts1, ts2)).toBe(expected);
  });

  it('is symmetric (absolute difference)', () => {
    expect(minuteDifference(3_600_000, 0)).toBe(minuteDifference(0, 3_600_000));
  });
});

describe('unit conversion helpers', () => {
  it('secondsToMs converts seconds to milliseconds', () => {
    expect(secondsToMs(1)).toBe(1_000);
    expect(secondsToMs(60)).toBe(60_000);
  });

  it('minutesToMs converts minutes to milliseconds', () => {
    expect(minutesToMs(1)).toBe(60_000);
    expect(minutesToMs(60)).toBe(3_600_000);
  });

  it('hoursToMs converts hours to milliseconds', () => {
    expect(hoursToMs(1)).toBe(3_600_000);
    expect(hoursToMs(24)).toBe(86_400_000);
  });

  it('daysToMs converts days to milliseconds', () => {
    expect(daysToMs(1)).toBe(86_400_000);
    expect(daysToMs(7)).toBe(604_800_000);
  });

  it('conversion chain is consistent: daysToMs(1) === hoursToMs(24)', () => {
    expect(daysToMs(1)).toBe(hoursToMs(24));
  });
});
