import { render, screen } from '@testing-library/react';
import { Provider } from 'jotai';
import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import type { MatrixEvent, Room } from '$types/matrix-sdk';
import { modalAtom, ModalType, pushModalAtom } from '$state/modal';
import { GlobalModalManager } from './GlobalModalManager';

vi.mock('./Options', () => ({
  MobileOptionsInternal: () => <div data-testid="options-sheet" />,
}));
vi.mock('./MessageReactionPicker', () => ({
  MessageReactionPickerInternal: () => <div data-testid="reaction-picker" />,
}));
vi.mock('./MessageReproxyPicker', () => ({
  MessageReproxyPickerInternal: () => <div data-testid="reproxy-picker" />,
}));
vi.mock('./MessageReport', () => ({ MessageReportInternal: () => <div /> }));
vi.mock('./MessageDelete', () => ({ MessageDeleteInternal: () => <div /> }));
vi.mock('./MessageEditHistory', () => ({ MessageEditHistoryInternal: () => <div /> }));
vi.mock('./MessageSource', () => ({ MessageSourceInternal: () => <div /> }));
vi.mock('./MessageForward', () => ({ MessageForwardInternal: () => <div /> }));
vi.mock('./MessageReactions', () => ({ MessageAllReactionInternal: () => <div /> }));
vi.mock('./MessageReadRecipts', () => ({ MessageReadReceiptInternal: () => <div /> }));

const mEvent = {} as MatrixEvent;
const room = {} as Room;

const openOptions = (store: ReturnType<typeof createStore>) =>
  store.set(modalAtom, {
    type: ModalType.MobileOptions,
    options: { mEvent, room, closeMenu: vi.fn<() => void>(), onReplyClick: vi.fn<() => void>() },
  });

const renderWith = (store: ReturnType<typeof createStore>) =>
  render(
    <Provider store={store}>
      <GlobalModalManager />
    </Provider>
  );

describe('GlobalModalManager', () => {
  it('renders the options sheet on its own', () => {
    const store = createStore();
    openOptions(store);

    renderWith(store);

    expect(screen.getByTestId('options-sheet')).toBeTruthy();
  });

  it('unmounts the options sheet while the reaction picker is over it', () => {
    const store = createStore();
    openOptions(store);
    store.set(pushModalAtom, {
      type: ModalType.ReactionPicker,
      mEvent,
      closeMenu: vi.fn<() => void>(),
    });

    renderWith(store);

    expect(screen.getByTestId('reaction-picker')).toBeTruthy();
    expect(screen.queryByTestId('options-sheet')).toBeNull();
  });

  it('unmounts the options sheet while the persona picker is over it', () => {
    const store = createStore();
    openOptions(store);
    store.set(pushModalAtom, {
      type: ModalType.ReproxyPicker,
      room,
      mEvent,
      closeMenu: vi.fn<() => void>(),
    });

    renderWith(store);

    expect(screen.getByTestId('reproxy-picker')).toBeTruthy();
    expect(screen.queryByTestId('options-sheet')).toBeNull();
  });
});
