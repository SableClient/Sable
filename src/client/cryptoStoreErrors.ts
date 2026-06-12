export type CryptoStoreIndexedDbErrorType =
  | 'transaction_aborted'
  | 'transaction_error'
  | 'connection_closed'
  | 'invalid_state'
  | 'unknown_idb_error'
  | 'crypto_store_error';

export const classifyCryptoStoreIndexedDbError = (
  errorMessage: string
): CryptoStoreIndexedDbErrorType | undefined => {
  if (errorMessage.includes('Transaction aborted')) return 'transaction_aborted';
  if (errorMessage.includes('without an in-progress transaction')) return 'transaction_error';
  if (errorMessage.includes('database connection is closed')) return 'connection_closed';
  if (errorMessage.includes('InvalidStateError')) return 'invalid_state';
  if (errorMessage.includes('UnknownError')) return 'unknown_idb_error';
  if (errorMessage.includes('failed to read or write to the crypto store')) {
    return 'crypto_store_error';
  }
  return undefined;
};

export const isCryptoStoreIndexedDbError = (errorMessage: string): boolean =>
  classifyCryptoStoreIndexedDbError(errorMessage) !== undefined;
