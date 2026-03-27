import { afterEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { ThemeKind } from '$hooks/useTheme';

import { ArboriumThemeBridge, useArboriumThemeStatus } from './ArboriumThemeBridge';

function StatusProbe() {
  const { ready } = useArboriumThemeStatus();

  return <div data-testid="arborium-status">{ready ? 'ready' : 'loading'}</div>;
}

const pluginVersion = '2.16.0';
const baseHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/themes/base-rustdoc.css`;
const darkHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/themes/one-dark.css`;
const lightHref = `https://cdn.jsdelivr.net/npm/@arborium/arborium@${pluginVersion}/themes/github-light.css`;

afterEach(() => {
  document.getElementById('arborium-base')?.remove();
  document.getElementById('arborium-theme')?.remove();
});

describe('ArboriumThemeBridge', () => {
  it('injects the base stylesheet once and swaps the theme stylesheet from dark to light', () => {
    const { rerender } = render(
      <ArboriumThemeBridge kind={ThemeKind.Dark}>
        <StatusProbe />
      </ArboriumThemeBridge>
    );

    const baseLink = document.getElementById('arborium-base');
    const themeLink = document.getElementById('arborium-theme');

    expect(baseLink).toBeInstanceOf(HTMLLinkElement);
    expect(themeLink).toBeInstanceOf(HTMLLinkElement);
    expect(baseLink).toHaveAttribute('href', baseHref);
    expect(themeLink).toHaveAttribute('href', darkHref);
    expect(document.head.querySelectorAll('#arborium-base')).toHaveLength(1);
    expect(document.head.querySelectorAll('#arborium-theme')).toHaveLength(1);
    expect(screen.getByTestId('arborium-status')).toHaveTextContent('loading');

    act(() => {
      baseLink?.dispatchEvent(new Event('load'));
      themeLink?.dispatchEvent(new Event('load'));
    });

    expect(screen.getByTestId('arborium-status')).toHaveTextContent('ready');

    rerender(
      <ArboriumThemeBridge kind={ThemeKind.Light}>
        <StatusProbe />
      </ArboriumThemeBridge>
    );

    const nextBaseLink = document.getElementById('arborium-base');
    const nextThemeLink = document.getElementById('arborium-theme');

    expect(nextBaseLink).toBe(baseLink);
    expect(nextThemeLink).toBe(themeLink);
    expect(document.head.querySelectorAll('#arborium-base')).toHaveLength(1);
    expect(nextBaseLink).toHaveAttribute('href', baseHref);
    expect(nextThemeLink).toHaveAttribute('href', lightHref);
    expect(screen.getByTestId('arborium-status')).toHaveTextContent('loading');
  });
});
