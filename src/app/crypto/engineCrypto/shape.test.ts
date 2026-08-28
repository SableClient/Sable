import { describe, expect, it } from 'vitest';
import { EventShieldColour, EventShieldReason } from '$types/matrix-sdk';
import { toEventEncryptionInfo } from './EngineCrypto';

/** Engine payloads are cast from JSON, so only these pin the numeric encodings. */
describe('toEventEncryptionInfo', () => {
  it('maps engine colours onto the SDK enum', () => {
    expect(toEventEncryptionInfo({ shieldStateLax: { color: 0 } })?.shieldColour).toBe(
      EventShieldColour.RED
    );
    expect(toEventEncryptionInfo({ shieldStateLax: { color: 1 } })?.shieldColour).toBe(
      EventShieldColour.GREY
    );
    expect(toEventEncryptionInfo({ shieldStateLax: { color: 2 } })?.shieldColour).toBe(
      EventShieldColour.NONE
    );
  });

  it('maps every engine shield code onto the SDK reason', () => {
    const expected: [number, EventShieldReason][] = [
      [0, EventShieldReason.AUTHENTICITY_NOT_GUARANTEED],
      [1, EventShieldReason.UNKNOWN_DEVICE],
      [2, EventShieldReason.UNSIGNED_DEVICE],
      [3, EventShieldReason.UNVERIFIED_IDENTITY],
      [4, EventShieldReason.VERIFICATION_VIOLATION],
      [5, EventShieldReason.MISMATCHED_SENDER],
    ];

    expected.forEach(([code, reason]) => {
      expect(toEventEncryptionInfo({ shieldStateLax: { color: 0, code } })?.shieldReason).toBe(
        reason
      );
    });
  });

  it('has no reason when the engine sends none', () => {
    expect(toEventEncryptionInfo({ shieldStateLax: { color: 2, code: null } })?.shieldReason).toBe(
      null
    );
    expect(toEventEncryptionInfo({ shieldStateLax: { color: 2 } })?.shieldReason).toBe(null);
  });

  // Fail safe: an unrecognised code must not silently read as "no warning".
  it('falls back to a warning rather than clearing the shield', () => {
    const unknown = toEventEncryptionInfo({ shieldStateLax: { color: 99, code: 99 } });
    expect(unknown?.shieldColour).toBe(EventShieldColour.RED);
    expect(unknown?.shieldReason).toBe(EventShieldReason.UNKNOWN);
  });

  it('returns null when the engine has no info', () => {
    expect(toEventEncryptionInfo(null)).toBeNull();
    expect(toEventEncryptionInfo({})).toBeNull();
  });
});
