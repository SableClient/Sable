import { fireEvent, render, screen } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';
import { ScreenSize, ScreenSizeProvider } from '$hooks/useScreenSize';
import { defaultSettings, settingsAtom } from '$state/settings';
import { KeyboardShortcuts } from './KeyboardShortcuts';

const renderPage = () => {
  const store = createStore();
  store.set(settingsAtom, { ...defaultSettings, shortcutOverrides: {} });
  render(
    <Provider store={store}>
      <ScreenSizeProvider value={ScreenSize.Desktop}>
        <KeyboardShortcuts requestClose={() => {}} />
      </ScreenSizeProvider>
    </Provider>
  );
  return store;
};

describe('KeyboardShortcuts', () => {
  beforeEach(() => localStorage.clear());

  it('captures and resets a custom binding', () => {
    const store = renderPage();
    const change = screen.getByRole('button', { name: 'Change Bold' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'j', ctrlKey: true });
    expect(store.get(settingsAtom).shortcutOverrides['composer.bold']).toBe('mod+j');

    fireEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]!);
    expect(store.get(settingsAtom).shortcutOverrides['composer.bold']).toBeUndefined();
  });

  it('reports a binding conflict in an overlapping scope', () => {
    const store = renderPage();
    const change = screen.getByRole('button', { name: 'Change Bold' });

    fireEvent.click(change);
    fireEvent.keyDown(change, { key: 'f', ctrlKey: true });

    expect(screen.getByText(/Already used by “Search for messages”/)).toBeInTheDocument();
    expect(store.get(settingsAtom).shortcutOverrides['composer.bold']).toBeUndefined();
  });
});
