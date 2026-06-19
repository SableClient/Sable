import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MsgType } from '$types/matrix-sdk';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { RenderMessageContent } from './RenderMessageContent';

const urlPreviewCardSpy = vi.fn<(props: { url: string; mediaType?: string | null }) => JSX.Element>(
  ({ url }: { url: string }) => <div data-testid="url-preview-card">{url}</div>
);

vi.mock('./url-preview', () => ({
  UrlPreviewHolder: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="url-preview-holder">{children}</div>
  ),
  UrlPreviewCard: (props: { url: string; mediaType?: string }) => urlPreviewCardSpy(props),
  ClientPreview: ({ url }: { url: string }) => <div data-testid="client-preview">{url}</div>,
  youtubeUrl: () => false,
}));

function renderMessage(
  body: string,
  options?: { urlPreview?: boolean; clientUrlPreview?: boolean }
) {
  return render(
    <ClientConfigProvider value={{}}>
      <RenderMessageContent
        displayName="Alice"
        msgType={MsgType.Text}
        ts={0}
        getContent={() => ({ body }) as never}
        urlPreview={options?.urlPreview ?? true}
        clientUrlPreview={options?.clientUrlPreview ?? true}
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
  urlPreviewCardSpy.mockClear();
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

  it('does not render direct media previews when client-side embeds are disabled', () => {
    renderMessage('https://example.com/test.png', { urlPreview: false, clientUrlPreview: false });

    expect(screen.queryByTestId('url-preview-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-preview')).not.toBeInTheDocument();
  });

  it('renders both media and non-media url previews when client embeds are enabled', () => {
    renderMessage('https://example.com/test.png https://example.com/post', {
      urlPreview: true,
      clientUrlPreview: true,
    });

    expect(screen.getAllByTestId('url-preview-card')).toHaveLength(2);
    expect(urlPreviewCardSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: 'https://example.com/test.png', mediaType: 'image' })
    );
    expect(urlPreviewCardSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: 'https://example.com/post', mediaType: null })
    );
  });

  it('renders direct media previews when only client-side embeds are enabled', () => {
    renderMessage('https://example.com/test.png', { urlPreview: false, clientUrlPreview: true });

    expect(screen.getByTestId('url-preview-card')).toBeInTheDocument();
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/test.png', mediaType: 'image' })
    );
  });

  it('treats query-string media urls as direct previews', () => {
    renderMessage('https://example.com/test.jpg?token=abc', {
      urlPreview: false,
      clientUrlPreview: true,
    });

    expect(screen.getByTestId('url-preview-card')).toBeInTheDocument();
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/test.jpg?token=abc', mediaType: 'image' })
    );
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
