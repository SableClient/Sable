import { describe, expect, it } from 'vitest';
import {
  classifyCryptoStoreIndexedDbError,
  isCryptoStoreIndexedDbError,
} from './cryptoStoreErrors';

describe('crypto store IndexedDB error classification', () => {
  it('classifies Safari IndexedDB transaction aborts from rust crypto logs', () => {
    const message =
      'failed to read or write to the crypto store DomException Error (0): Transaction aborted';

    expect(classifyCryptoStoreIndexedDbError(message)).toBe('transaction_aborted');
    expect(isCryptoStoreIndexedDbError(message)).toBe(true);
  });

  it('classifies rust crypto backend transaction aborts', () => {
    const message =
      'Backend(DomException { code: 0, name: "Error", message: "Transaction aborted" })';

    expect(classifyCryptoStoreIndexedDbError(message)).toBe('transaction_aborted');
    expect(isCryptoStoreIndexedDbError(message)).toBe(true);
  });

  it('classifies pre-existing IndexedDB transaction errors', () => {
    expect(classifyCryptoStoreIndexedDbError('without an in-progress transaction')).toBe(
      'transaction_error'
    );
    expect(classifyCryptoStoreIndexedDbError('database connection is closed')).toBe(
      'connection_closed'
    );
    expect(classifyCryptoStoreIndexedDbError('InvalidStateError while reading IDB')).toBe(
      'invalid_state'
    );
    expect(classifyCryptoStoreIndexedDbError('UnknownError while opening IDB')).toBe(
      'unknown_idb_error'
    );
  });

  it('classifies generic crypto store read/write errors', () => {
    expect(classifyCryptoStoreIndexedDbError('failed to read or write to the crypto store')).toBe(
      'crypto_store_error'
    );
  });

  it('ignores unrelated sync errors', () => {
    expect(classifyCryptoStoreIndexedDbError('Fetch is aborted')).toBeUndefined();
    expect(isCryptoStoreIndexedDbError('Fetch is aborted')).toBe(false);
  });
});
