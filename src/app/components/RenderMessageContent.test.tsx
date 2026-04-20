import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MsgType } from '$types/matrix-sdk';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { RenderMessageContent } from './RenderMessageContent';

vi.mock('./url-preview', () => ({
  UrlPreviewHolder: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="url-preview-holder">{children}</div>
  ),
  UrlPreviewCard: ({ url }: { url: string }) => <div data-testid="url-preview-card">{url}</div>,
  ClientPreview: ({ url }: { url: string }) => <div data-testid="client-preview">{url}</div>,
  youtubeUrl: () => false,
}));

function renderMessage(body: string) {
  return render(
    <ClientConfigProvider value={{}}>
      <RenderMessageContent
        displayName="Alice"
        msgType={MsgType.Text}
        ts={0}
        getContent={() => ({ body }) as never}
        urlPreview
        clientUrlPreview
        htmlReactParserOptions={{}}
        linkifyOpts={{}}
      />
    </ClientConfigProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://app.example' } as Location);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RenderMessageContent', () => {
  it('does not render url previews for settings links', () => {
    renderMessage(
      'https://app.example/settings/account?focus=status&moe.sable.client.action=settings'
    );

    expect(screen.queryByTestId('url-preview-holder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('url-preview-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-preview')).not.toBeInTheDocument();
  });

  it('still renders url previews for non-settings links', () => {
    renderMessage('https://example.com');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com');
  });

  it('still renders url previews for malformed settings-looking links', () => {
    renderMessage(
      'https://app.example/settings/account?focus=status&moe.sable.client.action=settings">Settings'
    );

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent(
      'https://app.example/settings/account?focus=status&moe.sable.client.action=settings">Settings'
    );
  });

  it('still renders url previews for settings links with unknown focus ids', () => {
    renderMessage('https://app.example/settings/account?focus=display-name2');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent(
      'https://app.example/settings/account?focus=display-name2'
    );
  });
});
