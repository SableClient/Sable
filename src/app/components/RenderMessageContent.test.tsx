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

  it('still renders url previews for settings links with unknown focus ids', () => {
    renderMessage('https://app.example/settings/account?focus=display-name2');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent(
      'https://app.example/settings/account?focus=display-name2'
    );
  });

  it('still renders url previews for non-settings links', () => {
    renderMessage('https://example.com');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com');
  });

  it('render url previews for text starting with paranthesis', () => {
    renderMessage('foo (https://example.com bar');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com');
  });

  it('include ending paranthesis into the url preview per url spec', () => {
    renderMessage('foo https://example.com) bar');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com)');
  });

  it('exclude closing paranthesis from the url preview when it marks a []() hyperlink', () => {
    renderMessage('[foo](https://example.com) bar');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com');
  });

  it('include inner closing paranthesis from the url preview even within []() hyperlink', () => {
    renderMessage('[foo](https://example.com)) bar');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com)');
  });
});
