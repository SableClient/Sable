import { describe, expect, it } from 'vitest';
import { isMissingBackupKeyError } from './backupRestore';

describe('isMissingBackupKeyError', () => {
  it('matches the error the crypto store raises without a cached key', () => {
    expect(isMissingBackupKeyError(new Error('No decryption key found in crypto store'))).toBe(
      true
    );
  });

  it('matches the same error as a plain string', () => {
    expect(isMissingBackupKeyError('No decryption key found in crypto store')).toBe(true);
  });

  it('ignores case', () => {
    expect(isMissingBackupKeyError(new Error('NO DECRYPTION KEY FOUND'))).toBe(true);
  });

  it('does not match unrelated restore failures', () => {
    expect(isMissingBackupKeyError(new Error('Backup version not found'))).toBe(false);
    expect(isMissingBackupKeyError(new Error('M_LIMIT_EXCEEDED'))).toBe(false);
  });

  it('handles absent and non-stringifiable values', () => {
    expect(isMissingBackupKeyError(undefined)).toBe(false);
    expect(isMissingBackupKeyError(null)).toBe(false);
    expect(isMissingBackupKeyError({})).toBe(false);
  });
});
