import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { modalAtom, ModalType, popModalAtom, pushModalAtom } from './modal';
import type { ModalState } from './modal';

const mEvent = {} as MatrixEvent;
const room = {} as Room;

const options: Extract<ModalState, { type: ModalType.MobileOptions }> = {
  type: ModalType.MobileOptions,
  options: { mEvent, room, closeMenu: vi.fn<() => void>(), onReplyClick: vi.fn<() => void>() },
};

const picker: Extract<ModalState, { type: ModalType.ReactionPicker }> = {
  type: ModalType.ReactionPicker,
  mEvent,
  closeMenu: vi.fn<() => void>(),
};

const reactions: Extract<ModalState, { type: ModalType.Reactions }> = {
  type: ModalType.Reactions,
  room,
  relations: {} as never,
};

describe('modalAtom', () => {
  it('shows nothing until a modal opens', () => {
    expect(createStore().get(modalAtom)).toBeNull();
  });

  it('replaces rather than stacks when set directly', () => {
    const store = createStore();

    store.set(modalAtom, options);
    store.set(modalAtom, reactions);
    expect(store.get(modalAtom)).toBe(reactions);

    store.set(popModalAtom);
    expect(store.get(modalAtom)).toBeNull();
  });

  it('closes everything when set to null', () => {
    const store = createStore();

    store.set(modalAtom, options);
    store.set(pushModalAtom, picker);
    store.set(modalAtom, null);

    expect(store.get(modalAtom)).toBeNull();
  });
});

describe('pushModalAtom', () => {
  it('shows only the pushed modal, so the one beneath cannot render behind it', () => {
    const store = createStore();

    store.set(modalAtom, options);
    store.set(pushModalAtom, picker);

    expect(store.get(modalAtom)).toBe(picker);
  });

  it('returns to the modal underneath when popped', () => {
    const store = createStore();

    store.set(modalAtom, options);
    store.set(pushModalAtom, picker);
    store.set(popModalAtom);

    expect(store.get(modalAtom)).toBe(options);
  });
});

describe('popModalAtom', () => {
  it('closes a modal that opened on its own', () => {
    const store = createStore();

    store.set(modalAtom, reactions);
    store.set(popModalAtom);

    expect(store.get(modalAtom)).toBeNull();
  });

  it('does nothing when no modal is open', () => {
    const store = createStore();

    store.set(popModalAtom);

    expect(store.get(modalAtom)).toBeNull();
  });
});
