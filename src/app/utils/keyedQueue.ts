/** Serializes operations per key so read-modify-write sequences cannot interleave. */
export function createKeyedQueue() {
  const tails = new Map<string, Promise<void>>();

  return function run<T>(key: string, operation: () => T | PromiseLike<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current.then(
      () => undefined,
      () => undefined
    );

    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });

    return current;
  };
}
