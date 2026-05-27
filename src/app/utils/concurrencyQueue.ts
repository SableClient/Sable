/**
 * Simple concurrency limiter for HTTP requests.
 * Limits the number of concurrent promises to prevent connection pool saturation.
 */
export class ConcurrencyQueue {
  private queue: Array<() => void> = [];
  private activeCount = 0;

  constructor(private maxConcurrency: number) {}

  async add<R>(fn: () => Promise<R>): Promise<R> {
    // Wait for a slot to become available
    /* eslint-disable no-await-in-loop -- intentional: sequential waiting for queue slot */
    while (this.activeCount >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    /* eslint-enable no-await-in-loop */

    this.activeCount++;

    try {
      return await fn();
    } finally {
      this.activeCount--;
      // Release the next waiting task
      const next = this.queue.shift();
      if (next) next();
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }
}
