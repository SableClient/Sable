import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopSpellcheck } from './DesktopSpellcheck';

const { mockIsDesktopTauri, mockUseDesktopSetting } = vi.hoisted(() => ({
  mockIsDesktopTauri: vi.fn<() => boolean>(),
  mockUseDesktopSetting: vi.fn<() => readonly [boolean, (value: boolean) => void]>(),
}));

vi.mock('$utils/platform', () => ({
  isDesktopTauri: mockIsDesktopTauri,
}));

vi.mock('$state/hooks/desktopSettings', () => ({
  useDesktopSetting: mockUseDesktopSetting,
}));

describe('DesktopSpellcheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDesktopSetting.mockReturnValue([true, vi.fn<(value: boolean) => void>()]);
  });

  afterEach(() => {
    document.body.removeAttribute('spellcheck');
  });

  it('disables inherited spellcheck on the body when the setting is off', () => {
    mockIsDesktopTauri.mockReturnValue(true);
    mockUseDesktopSetting.mockReturnValue([false, vi.fn<(value: boolean) => void>()]);

    render(<DesktopSpellcheck />);

    expect(document.body.spellcheck).toBe(false);
  });

  it('keeps inherited spellcheck enabled on the body when the setting is on', () => {
    mockIsDesktopTauri.mockReturnValue(true);

    render(<DesktopSpellcheck />);

    expect(document.body.spellcheck).toBe(true);
  });

  it('follows setting changes after mount', () => {
    mockIsDesktopTauri.mockReturnValue(true);
    mockUseDesktopSetting.mockReturnValue([true, vi.fn<(value: boolean) => void>()]);

    const { rerender } = render(<DesktopSpellcheck />);
    expect(document.body.spellcheck).toBe(true);

    mockUseDesktopSetting.mockReturnValue([false, vi.fn<(value: boolean) => void>()]);
    rerender(<DesktopSpellcheck />);

    expect(document.body.spellcheck).toBe(false);
  });

  it('does not touch the body outside desktop Tauri builds', () => {
    mockIsDesktopTauri.mockReturnValue(false);
    mockUseDesktopSetting.mockReturnValue([false, vi.fn<(value: boolean) => void>()]);

    render(<DesktopSpellcheck />);

    expect(document.body.hasAttribute('spellcheck')).toBe(false);
  });
});
