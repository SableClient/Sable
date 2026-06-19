import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MsgType } from '$types/matrix-sdk';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { RenderMessageContent } from './RenderMessageContent';

const settings = {
  autoplayGifs: false,
  captionPosition: 'below',
  themeChatSableWidgetsEnabled: true,
  multiplePreviews: true,
  clientPreviewYoutube: false,
};

const urlPreviewCardSpy = vi.fn<
  (props: { url: string; mediaType?: string | null; bundle?: { 'og:url'?: string } }) => JSX.Element
>(({ url, bundle }: { url: string; bundle?: { 'og:url'?: string } }) => (
  <div data-testid={bundle ? 'bundled-preview-card' : 'url-preview-card'}>{url}</div>
));
const youtubeUrlSpy = vi.fn<(url: string) => boolean>((url: string) => url.includes('youtu'));

vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: keyof typeof settings) => [settings[key], vi.fn<() => void>()],
}));

vi.mock('./url-preview', () => ({
  UrlPreviewHolder: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="url-preview-holder">{children}</div>
  ),
  UrlPreviewCard: (props: { url: string; mediaType?: string }) => urlPreviewCardSpy(props),
  ClientPreview: ({ url }: { url: string }) => <div data-testid="client-preview">{url}</div>,
  ThemePreviewUrlCard: ({ url }: { url: string }) => <div data-testid="theme-preview">{url}</div>,
  TweakPreviewUrlCard: ({ url }: { url: string }) => <div data-testid="tweak-preview">{url}</div>,
  youtubeUrl: (url: string) => youtubeUrlSpy(url),
}));

function renderMessage(
  bodyOrContent: string | Record<string, unknown>,
  options?: {
    urlPreview?: boolean;
    clientUrlPreview?: boolean;
    mediaAutoLoad?: boolean;
    bundledPreview?: boolean;
  }
) {
  const content =
    typeof bodyOrContent === 'string'
      ? ({ body: bodyOrContent } as never)
      : (bodyOrContent as never);
  return render(
    <ClientConfigProvider value={{}}>
      <RenderMessageContent
        displayName="Alice"
        msgType={MsgType.Text}
        ts={0}
        getContent={() => content}
        urlPreview={options?.urlPreview ?? true}
        clientUrlPreview={options?.clientUrlPreview ?? true}
        mediaAutoLoad={options?.mediaAutoLoad ?? true}
        bundledPreview={options?.bundledPreview ?? false}
        htmlReactParserOptions={{}}
        linkifyOpts={{}}
      />
    </ClientConfigProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://app.example' } as Location);
  settings.autoplayGifs = false;
  settings.captionPosition = 'below';
  settings.themeChatSableWidgetsEnabled = true;
  settings.multiplePreviews = true;
  settings.clientPreviewYoutube = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  urlPreviewCardSpy.mockClear();
  youtubeUrlSpy.mockClear();
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
      expect.objectContaining({ url: 'https://example.com/post', mediaType: undefined })
    );
  });

  it('renders direct media previews when only client-side embeds are enabled', () => {
    renderMessage('https://example.com/test.png', { urlPreview: false, clientUrlPreview: true });

    expect(screen.getByTestId('url-preview-card')).toBeInTheDocument();
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/test.png', mediaType: 'image' })
    );
  });

  it('prefers direct media before ordinary links when single-preview mode is enabled', () => {
    settings.multiplePreviews = false;

    renderMessage('https://example.com/post https://cdn.example/test.png', {
      urlPreview: true,
      clientUrlPreview: true,
    });

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent(
      'https://cdn.example/test.png'
    );
    expect(urlPreviewCardSpy).toHaveBeenCalledTimes(1);
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example/test.png', mediaType: 'image' })
    );
  });

  it('filters non-renderable links before limiting client-only previews', () => {
    renderMessage('https://example.com/post https://cdn.example/test.png', {
      urlPreview: false,
      clientUrlPreview: true,
    });

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent(
      'https://cdn.example/test.png'
    );
    expect(urlPreviewCardSpy).toHaveBeenCalledTimes(1);
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example/test.png', mediaType: 'image' })
    );
  });

  it('does not render an empty preview holder when no urls are renderable', () => {
    renderMessage('https://example.com/post', { urlPreview: false, clientUrlPreview: true });

    expect(screen.queryByTestId('url-preview-holder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('url-preview-card')).not.toBeInTheDocument();
  });

  it('renders widget previews without crashing when single-preview mode has no standard candidates', () => {
    renderMessage('https://foo.preview.sable.css');

    expect(screen.getByTestId('url-preview-holder')).toBeInTheDocument();
    expect(screen.getByTestId('theme-preview')).toHaveTextContent('https://foo.preview.sable.css');
    expect(screen.queryByTestId('url-preview-card')).not.toBeInTheDocument();
  });

  it('does not keep youtube links as renderable candidates when youtube embeds are disabled', () => {
    renderMessage('https://youtu.be/abc123', { urlPreview: false, clientUrlPreview: true });

    expect(screen.queryByTestId('url-preview-holder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-preview')).not.toBeInTheDocument();
  });

  it('treats apng links as direct image previews', () => {
    settings.autoplayGifs = true;

    renderMessage('https://example.com/anim.apng', { urlPreview: false, clientUrlPreview: true });

    expect(screen.getByTestId('url-preview-card')).toBeInTheDocument();
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/anim.apng', mediaType: 'image' })
    );
  });

  it('preserves direct media candidates alongside bundled preview urls', () => {
    renderMessage(
      {
        body: 'https://example.com/post https://cdn.example/test.png',
        'com.beeper.linkpreviews': [
          { matched_url: 'https://example.com/post', 'og:url': 'https://example.com/post' },
        ],
      },
      { urlPreview: false, clientUrlPreview: true, bundledPreview: true }
    );

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent(
      'https://cdn.example/test.png'
    );
    expect(screen.getByTestId('bundled-preview-card')).toHaveTextContent(
      'https://example.com/post'
    );
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.example/test.png', mediaType: 'image' })
    );
  });

  it('does not let direct gif fallbacks consume the only preview slot', () => {
    settings.multiplePreviews = false;

    renderMessage('https://example.com/post https://cdn.example/test.gif', {
      urlPreview: true,
      clientUrlPreview: true,
    });

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com/post');
    expect(urlPreviewCardSpy).toHaveBeenCalledTimes(1);
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/post', mediaType: undefined })
    );
  });

  it('does not let auto-load-disabled direct media consume the only preview slot', () => {
    settings.multiplePreviews = false;

    renderMessage('https://example.com/post https://cdn.example/test.png', {
      urlPreview: true,
      clientUrlPreview: true,
      mediaAutoLoad: false,
    });

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com/post');
    expect(urlPreviewCardSpy).toHaveBeenCalledTimes(1);
    expect(urlPreviewCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/post', mediaType: undefined })
    );
  });

  it('keeps hidden preview-suppressed direct media urls out of the merged candidate list', () => {
    renderMessage(
      {
        body: '<https://cdn.example/test.png>',
        'com.beeper.linkpreviews': [],
      },
      { urlPreview: false, clientUrlPreview: true }
    );

    expect(screen.queryByTestId('url-preview-holder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('url-preview-card')).not.toBeInTheDocument();
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
