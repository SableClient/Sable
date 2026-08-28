type PromiseResolvers<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

type PromiseConstructorWithResolvers = {
  withResolvers?: <T>() => PromiseResolvers<T>;
};

export function installPromiseWithResolversPolyfill(): void {
  const promiseConstructor = Promise as unknown as PromiseConstructorWithResolvers;
  if (promiseConstructor.withResolvers) return;

  promiseConstructor.withResolvers = <T>(): PromiseResolvers<T> => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });

    return { promise, resolve, reject };
  };
}

installPromiseWithResolversPolyfill();
