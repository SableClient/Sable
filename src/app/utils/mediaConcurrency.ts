// Media shares its host with the Matrix API, and browsers cap connections per host at 6.
// Leave slots free so a wave of media loads cannot queue /sync and /send behind it.
const MAX_CONCURRENT_MEDIA_FETCHES = 3;

const waiters: (() => void)[] = [];
let active = 0;

export async function withMediaFetchSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active < MAX_CONCURRENT_MEDIA_FETCHES) {
    active += 1;
  } else {
    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
  }

  try {
    return await task();
  } finally {
    // Hand the slot straight to the next waiter instead of releasing and re-acquiring it.
    // Newest first: a picker opened over a loading member list would otherwise wait
    // behind every one of its avatars.
    const next = waiters.pop();
    if (next) next();
    else active -= 1;
  }
}
