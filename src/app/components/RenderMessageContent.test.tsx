import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MsgType } from '$types/matrix-sdk';
import { M_POLL_START } from 'matrix-js-sdk';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { RenderMessageContent } from './RenderMessageContent';

vi.mock('./message/content/UploadedSableCssContent', () => ({
  UploadedSableCssContent: ({ body }: { body: string }) => (
    <div data-testid="uploaded-sable-css">{body}</div>
  ),
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('./url-preview', () => ({
  UrlPreviewHolder: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="url-preview-holder">{children}</div>
  ),
  UrlPreviewCard: ({ url, bundle }: { url: string; bundle?: unknown }) => (
    <div data-testid="url-preview-card">
      {bundle ? 'bundle:' : 'dynamic:'}
      {url}
    </div>
  ),
  ClientPreview: ({ url }: { url: string }) => <div data-testid="client-preview">{url}</div>,
  youtubeUrl: () => false,
}));

vi.mock('./message/PollEvent', () => ({
  PollEvent: () => <div data-testid="poll-event" />,
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

function renderFileMessage(content: Record<string, unknown>) {
  return render(
    <ClientConfigProvider value={{}}>
      <MatrixClientProvider value={{} as never}>
        <RenderMessageContent
          displayName="Alice"
          msgType={MsgType.File}
          ts={0}
          getContent={() => content as never}
          htmlReactParserOptions={{}}
          linkifyOpts={{}}
        />
      </MatrixClientProvider>
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
  it('does not render previews when the sender supplied an empty bundle', () => {
    render(
      <ClientConfigProvider value={{}}>
        <RenderMessageContent
          displayName="Alice"
          msgType={MsgType.Text}
          ts={0}
          bundledPreview
          urlPreview
          getContent={() =>
            ({ body: 'https://example.com', 'com.beeper.linkpreviews': [] }) as never
          }
          htmlReactParserOptions={{}}
          linkifyOpts={{}}
        />
      </ClientConfigProvider>
    );

    expect(screen.queryByTestId('url-preview-card')).not.toBeInTheDocument();
  });

  it('renders bundled metadata without fetching the URL again', () => {
    render(
      <ClientConfigProvider value={{}}>
        <RenderMessageContent
          displayName="Alice"
          msgType={MsgType.Text}
          ts={0}
          bundledPreview
          urlPreview
          getContent={() =>
            ({
              body: 'https://example.com',
              'com.beeper.linkpreviews': [
                { matched_url: 'https://example.com', 'og:title': 'Example' },
              ],
            }) as never
          }
          htmlReactParserOptions={{}}
          linkifyOpts={{}}
        />
      </ClientConfigProvider>
    );

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('bundle:https://example.com');
  });

  it('keeps dynamic previews for URL-only bundle markers', () => {
    render(
      <ClientConfigProvider value={{}}>
        <RenderMessageContent
          displayName="Alice"
          msgType={MsgType.Text}
          ts={0}
          bundledPreview
          urlPreview
          getContent={() =>
            ({
              body: 'https://example.com',
              'com.beeper.linkpreviews': [{ matched_url: 'https://example.com' }],
            }) as never
          }
          htmlReactParserOptions={{}}
          linkifyOpts={{}}
        />
      </ClientConfigProvider>
    );

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('dynamic:https://example.com');
  });

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

  it('detects an uploaded Sable theme by filename when the body is a caption', () => {
    renderFileMessage({
      msgtype: MsgType.File,
      body: 'A theme you might like',
      filename: 'amethyst.sable.css',
      url: 'mxc://example/amethyst',
      info: { mimetype: 'text/css', size: 1024 },
    });

    expect(screen.getByTestId('uploaded-sable-css')).toHaveTextContent('amethyst.sable.css');
  });

  it('renders current poll events', () => {
    render(
      <ClientConfigProvider value={{}}>
        <RenderMessageContent
          displayName="Alice"
          msgType=""
          ts={0}
          getContent={() => ({ [M_POLL_START.name]: {} })}
          htmlReactParserOptions={{}}
          linkifyOpts={{}}
          mEvent={{} as never}
          mx={{} as never}
          room={{} as never}
        />
      </ClientConfigProvider>
    );

    expect(screen.getByTestId('poll-event')).toBeInTheDocument();
  });
});
