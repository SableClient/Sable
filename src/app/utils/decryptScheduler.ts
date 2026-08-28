import type { MatrixClient, MatrixEvent } from '$types/matrix-sdk';

const FRAME_BUDGET_MS = 10;

const queue: Array<() => void> = [];
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : undefined;
let scheduled = false;

const drain = () => {
  scheduled = false;
  const deadline = performance.now() + FRAME_BUDGET_MS;
  while (queue.length > 0 && performance.now() < deadline) {
    queue.shift()?.();
  }
  if (queue.length > 0) schedule();
};

if (channel) {
  channel.port1.addEventListener('message', drain);
  channel.port1.start();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  if (channel) channel.port2.postMessage(null);
  else setTimeout(drain, 0);
}

export function scheduleDecrypt(task: () => void): void {
  queue.push(task);
  schedule();
}

export function warmupRoomDecryption(mx: MatrixClient, roomId: string, count = 12): void {
  const room = mx.getRoom(roomId);
  if (!room) return;
  const events: MatrixEvent[] = room.getLiveTimeline().getEvents().slice(-count);
  events.forEach((event) => {
    if (event.isEncrypted()) {
      scheduleDecrypt(() => {
        mx.decryptEventIfNeeded(event).catch(() => undefined);
      });
    }
  });
}
