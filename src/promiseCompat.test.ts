import { afterEach, describe, expect, it } from 'vitest';
import { installPromiseWithResolversPolyfill } from './promiseCompat';

const promiseConstructor = Promise as unknown as {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
};
const originalWithResolvers = promiseConstructor.withResolvers;

afterEach(() => {
  promiseConstructor.withResolvers = originalWithResolvers;
});

describe('installPromiseWithResolversPolyfill', () => {
  it('installs Promise.withResolvers when the runtime does not provide it', async () => {
    Reflect.deleteProperty(promiseConstructor, 'withResolvers');

    installPromiseWithResolversPolyfill();
    const deferred = promiseConstructor.withResolvers!<string>();
    deferred.resolve('resolved');

    await expect(deferred.promise).resolves.toBe('resolved');
  });
});
