import { describe, expect, it } from 'vitest';
import {
  getAppPathFromHref,
  getLoginPath,
  getRegisterPath,
  getSettingsPath,
  withSearchParam,
} from './pathUtils';

describe('getLoginPath', () => {
  it('omits the homeserver when there is none', () => {
    expect(getLoginPath()).toBe('/login');
  });

  it('carries the homeserver in the query string, never in a path segment', () => {
    expect(getLoginPath('matrix.org')).toBe('/login?server=matrix.org');
    expect(getLoginPath('http://localhost:18448')).toBe(
      '/login?server=http%3A%2F%2Flocalhost%3A18448'
    );
    expect(getRegisterPath('https://example.com/matrix')).toBe(
      '/register?server=https%3A%2F%2Fexample.com%2Fmatrix'
    );
  });
});

describe('withSearchParam', () => {
  it('merges into an existing query string', () => {
    expect(withSearchParam(getLoginPath('matrix.org'), { addAccount: '1' })).toBe(
      '/login?server=matrix.org&addAccount=1'
    );
  });

  it('overwrites a param that is already set', () => {
    expect(withSearchParam('/login?server=matrix.org', { server: 'sable.moe' })).toBe(
      '/login?server=sable.moe'
    );
  });
});

describe('getSettingsPath', () => {
  it('returns the settings root path', () => {
    expect(getSettingsPath()).toBe('/settings');
  });

  it('returns a section path with an optional focus query', () => {
    expect(getSettingsPath('devices')).toBe('/settings/devices');
    expect(getSettingsPath('appearance', 'message-link-preview')).toBe(
      '/settings/appearance?focus=message-link-preview'
    );
  });
});

describe('getAppPathFromHref', () => {
  it('extracts the app path for a matching browser-router origin', () => {
    expect(getAppPathFromHref('https://app.sable.moe/', 'https://app.sable.moe/')).toBe('/');
    expect(getAppPathFromHref('https://app.sable.moe/', 'https://app.sable.moe/login')).toBe(
      '/login'
    );
    expect(
      getAppPathFromHref('https://app.sable.moe/', 'https://app.sable.moe/home/room/%21abc')
    ).toBe('/home/room/%21abc');
  });

  it('extracts the app path for a matching hash-router origin', () => {
    expect(getAppPathFromHref('https://app.sable.moe/#/', 'https://app.sable.moe/#/')).toBe('/');
    expect(
      getAppPathFromHref('https://app.sable.moe/#/', 'https://app.sable.moe/#/login?code=c&state=s')
    ).toBe('/login?code=c&state=s');
  });

  it('extracts the path from the href when the origin does not match the base (Tauri)', () => {
    expect(getAppPathFromHref('https://app.sable.moe/', 'https://tauri.localhost/')).toBe('/');
    expect(
      getAppPathFromHref('https://app.sable.moe/', 'https://tauri.localhost/login?code=c&state=s')
    ).toBe('/login?code=c&state=s');
  });

  it('returns empty when a hash-router base is paired with a hashless href', () => {
    expect(getAppPathFromHref('https://app.sable.moe/#/', 'https://tauri.localhost/')).toBe('');
  });
});
