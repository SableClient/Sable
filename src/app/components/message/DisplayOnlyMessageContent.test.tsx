import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { DisplayOnlyMessageContent } from './DisplayOnlyMessageContent';

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$features/settings/useSettingsLinkBaseUrl', () => ({
  useSettingsLinkBaseUrl: () => 'http://localhost',
}));

vi.mock('$plugins/react-custom-html-parser', () => ({
  LINKIFY_OPTS: {},
  factoryRenderLinkifyWithMention: () => undefined,
  getReactCustomHtmlParser: () => ({}),
  renderMatrixMention: () => null,
}));

vi.mock('$components/RenderMessageContent', () => ({
  RenderMessageContent: ({ msgType }: { msgType: string }) => (
    <div data-testid="render-message-content">{msgType}</div>
  ),
}));

const renderWithProviders = (ui: ReactNode) =>
  render(
    <JotaiProvider>
      <MatrixClientProvider value={{} as never}>{ui}</MatrixClientProvider>
    </JotaiProvider>
  );

describe('DisplayOnlyMessageContent', () => {
  const room = {
    roomId: '!room:test',
  } as never;

  it('falls back to the shared preview text for non-message event types', () => {
    const mEvent = {
      getContent: () => ({ body: 'Party blob' }),
      getTs: () => 0,
      isRedacted: () => false,
      replacingEvent: () => undefined,
      getEffectiveEvent: () => ({ type: 'm.sticker' }),
      getType: () => 'm.sticker',
    } as never;

    renderWithProviders(
      <DisplayOnlyMessageContent room={room} mEvent={mEvent} fallbackText="fallback preview" />
    );

    expect(screen.getByText('🎉 Party blob')).toBeInTheDocument();
    expect(screen.queryByText('fallback preview')).not.toBeInTheDocument();
  });

  it('delegates room-message previews to RenderMessageContent', () => {
    const mEvent = {
      getContent: () => ({ msgtype: 'm.text', body: 'Hello world' }),
      getTs: () => 0,
      isRedacted: () => false,
      replacingEvent: () => undefined,
      getEffectiveEvent: () => ({ type: 'm.room.message' }),
      getType: () => 'm.room.message',
    } as never;

    renderWithProviders(
      <DisplayOnlyMessageContent room={room} mEvent={mEvent} fallbackText="fallback preview" />
    );

    expect(screen.getByTestId('render-message-content')).toHaveTextContent('m.text');
  });
});
