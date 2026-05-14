import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/debugLogger', () => ({
  createDebugLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
import {
  getInCallControlsContainer,
  getLeaveButton,
  getScreenshareButton,
  isElementToggledOn,
} from './elementCallDomAdapter';

type FakeElement = {
  checked?: boolean;
  parentElement?: FakeElement;
  previousElementSibling?: FakeElement;
  getAttribute: (name: string) => string | null;
};

const createFakeElement = (
  attrs: Record<string, string> = {},
  extra: Partial<FakeElement> = {}
): FakeElement => ({
  ...extra,
  getAttribute: (name: string) => attrs[name] ?? null,
});

describe('elementCallDomAdapter', () => {
  it('finds call controls container from leave button ancestry', () => {
    const container = createFakeElement();
    const row = createFakeElement({ }, { parentElement: container });
    const leave = createFakeElement({}, { parentElement: row });
    const doc = {
      querySelector: (selector: string) =>
        selector === '[data-testid="incall_leave"]' ? leave : null,
    } as Document;

    expect(getLeaveButton(doc)).toBe(leave);
    expect(getInCallControlsContainer(doc)).toBe(container);
  });

  it('falls back to aria-label selectors when test ids are missing', () => {
    const leave = createFakeElement();
    const screenshare = createFakeElement();
    const doc = {
      querySelector: (selector: string) => {
        if (selector === 'button[aria-label*="Leave" i]') return leave;
        if (selector === 'button[aria-label*="screen" i]') return screenshare;
        return null;
      },
    } as Document;

    expect(getLeaveButton(doc)).toBe(leave);
    expect(getScreenshareButton(doc)).toBe(screenshare);
  });

  it('detects toggled state for input, aria and data-kind controls', () => {
    const checkbox = createFakeElement({}, { checked: true });
    expect(isElementToggledOn(checkbox as unknown as HTMLElement)).toBe(true);

    const pressedButton = createFakeElement({ 'aria-pressed': 'true' });
    expect(isElementToggledOn(pressedButton as unknown as HTMLElement)).toBe(true);

    const dataKindButton = createFakeElement({ 'data-kind': 'primary' });
    expect(isElementToggledOn(dataKindButton as unknown as HTMLElement)).toBe(true);
  });
});
