export type LivePointerSubscriber = (x: number, y: number) => void;

const livePointerSubscribers = new Set<LivePointerSubscriber>();

const handlePointerMove = (evt: PointerEvent) => {
  livePointerSubscribers.forEach((subscriber) => subscriber(evt.clientX, evt.clientY));
};

export const subscribeToLivePointer = (subscriber: LivePointerSubscriber) => {
  livePointerSubscribers.add(subscriber);
  if (livePointerSubscribers.size === 1) {
    window.addEventListener('pointermove', handlePointerMove);
  }
};

export const unsubscribeFromLivePointer = (subscriber: LivePointerSubscriber) => {
  livePointerSubscribers.delete(subscriber);
  if (livePointerSubscribers.size === 0) {
    window.removeEventListener('pointermove', handlePointerMove);
  }
};
