import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createStore, Provider } from 'jotai';
import { pluginVersion } from '@arborium/arborium';

import { ThemeKind } from '$hooks/useTheme';
import { getSettings, settingsAtom } from '$state/settings';

import { ArboriumThemeBridge, useArboriumThemeStatus } from './ArboriumThemeBridge';
import {
  DEFAULT_ARBORIUM_DARK_THEME,
  DEFAULT_ARBORIUM_LIGHT_THEME,
  getArboriumThemeHref,
} from './themes';

function StatusProbe() {
  const { ready } = useArboriumThemeStatus();

  return <div data-testid="arborium-status">{ready ? 'ready' : 'loading'}</div>;
}

const baseHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/dist/themes/base-rustdoc.css`;

function renderWithSettings(kind: ThemeKind, settings = getSettings()) {
  const store = createStore();
  store.set(settingsAtom, settings);

  return render(
    <Provider store={store}>
      <ArboriumThemeBridge kind={kind}>
        <StatusProbe />
      </ArboriumThemeBridge>
    </Provider>
  );
}

afterEach(() => {
  document.getElementById('arborium-base')?.remove();
  document.getElementById('arborium-theme')?.remove();
});

describe('ArboriumThemeBridge', () => {
  it('injects the base stylesheet once and swaps the theme stylesheet from dark to light in system mode', () => {
    const store = createStore();
    store.set(settingsAtom, getSettings());

    const { rerender } = render(
      <Provider store={store}>
        <ArboriumThemeBridge kind={ThemeKind.Dark}>
          <StatusProbe />
        </ArboriumThemeBridge>
      </Provider>
    );

    const baseLink = document.getElementById('arborium-base');
    const themeLink = document.getElementById('arborium-theme');

    expect(baseLink).toBeInstanceOf(HTMLLinkElement);
    expect(themeLink).toBeInstanceOf(HTMLLinkElement);
    expect(baseLink).toHaveAttribute('href', baseHref);
    expect(themeLink).toHaveAttribute('href', getArboriumThemeHref(DEFAULT_ARBORIUM_DARK_THEME));
    expect(document.head.querySelectorAll('#arborium-base')).toHaveLength(1);
    expect(document.head.querySelectorAll('#arborium-theme')).toHaveLength(1);
    expect(screen.getByTestId('arborium-status')).toHaveTextContent('loading');

    act(() => {
      baseLink?.dispatchEvent(new Event('load'));
      themeLink?.dispatchEvent(new Event('load'));
    });

    expect(screen.getByTestId('arborium-status')).toHaveTextContent('ready');

    rerender(
      <Provider store={store}>
        <ArboriumThemeBridge kind={ThemeKind.Light}>
          <StatusProbe />
        </ArboriumThemeBridge>
      </Provider>
    );

    const nextBaseLink = document.getElementById('arborium-base');
    const nextThemeLink = document.getElementById('arborium-theme');

    expect(nextBaseLink).toBe(baseLink);
    expect(nextThemeLink).toBe(themeLink);
    expect(document.head.querySelectorAll('#arborium-base')).toHaveLength(1);
    expect(nextBaseLink).toHaveAttribute('href', baseHref);
    expect(nextThemeLink).toHaveAttribute(
      'href',
      getArboriumThemeHref(DEFAULT_ARBORIUM_LIGHT_THEME)
    );
    expect(screen.getByTestId('arborium-status')).toHaveTextContent('loading');
  });

  it('uses the configured Arborium theme ids from settings in system mode', () => {
    const settings = {
      ...getSettings(),
      useSystemArboriumTheme: true,
      arboriumLightTheme: 'ayu-light',
      arboriumDarkTheme: 'dracula',
    };

    renderWithSettings(ThemeKind.Dark, settings);

    const themeLink = document.getElementById('arborium-theme');
    expect(themeLink).toHaveAttribute('href', getArboriumThemeHref('dracula'));
  });

  it('uses the configured manual Arborium theme id when system mode is disabled', () => {
    const settings = {
      ...getSettings(),
      useSystemArboriumTheme: false,
      arboriumThemeId: 'dracula',
      arboriumLightTheme: 'ayu-light',
      arboriumDarkTheme: 'one-dark',
    };
    const store = createStore();
    store.set(settingsAtom, settings);

    const { rerender } = render(
      <Provider store={store}>
        <ArboriumThemeBridge kind={ThemeKind.Light}>
          <StatusProbe />
        </ArboriumThemeBridge>
      </Provider>
    );

    expect(document.getElementById('arborium-theme')).toHaveAttribute(
      'href',
      getArboriumThemeHref('dracula')
    );

    rerender(
      <Provider store={store}>
        <ArboriumThemeBridge kind={ThemeKind.Dark}>
          <StatusProbe />
        </ArboriumThemeBridge>
      </Provider>
    );

    expect(document.getElementById('arborium-theme')).toHaveAttribute(
      'href',
      getArboriumThemeHref('dracula')
    );
  });

  it('keeps readiness false when the theme stylesheet errors', () => {
    renderWithSettings(ThemeKind.Dark);

    const baseLink = document.getElementById('arborium-base');
    const themeLink = document.getElementById('arborium-theme');

    act(() => {
      baseLink?.dispatchEvent(new Event('load'));
      themeLink?.dispatchEvent(new Event('error'));
    });

    expect(screen.getByTestId('arborium-status')).toHaveTextContent('loading');
  });
});
