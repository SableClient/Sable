export type ComposerOperation<T> = (isLive: () => boolean) => T | Promise<T>;

export interface ComposerController {
  enqueue<T>(operation: ComposerOperation<T>): Promise<T | undefined>;
  dispose(): void;
}

/** Serializes composer sends so a slow send cannot interleave with the next one. */
export const createComposerController = (): ComposerController => {
  let queueTail: Promise<void> = Promise.resolve();
  let disposed = false;
  const isLive = () => !disposed;

  const enqueue = <T>(operation: ComposerOperation<T>): Promise<T | undefined> =>
    new Promise<T | undefined>((resolve, reject) => {
      const run = async () => {
        if (disposed) {
          resolve(undefined);
          return;
        }
        try {
          resolve(await operation(isLive));
        } catch (error) {
          reject(error);
        }
      };

      queueTail = queueTail.then(run, run).then(
        () => undefined,
        () => undefined
      );
    });

  return {
    enqueue,
    dispose: () => {
      disposed = true;
    },
  };
};
