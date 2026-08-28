import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MsgType } from '$types/matrix-sdk';
import { M_POLL_START } from 'matrix-js-sdk';
import { ClientConfigProvider } from '$hooks/useClientConfig';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { ModalType } from '$state/modal';
import { RenderMessageContent } from './RenderMessageContent';

vi.mock('./message/content/UploadedSableCssContent', () => ({
  UploadedSableCssContent: ({ body }: { body: string }) => (
    <div data-testid="uploaded-sable-css">{body}</div>
  ),
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

const { setModalSpy } = vi.hoisted(() => ({
  setModalSpy: vi.fn<(next: Record<string, unknown>) => void>(),
}));

vi.mock('$state/modal', async () => {
  const { atom } = await import('jotai');
  return {
    ModalType: { EditHistory: 'edit_history' },
    modalAtom: atom(null, (_get: unknown, _set: unknown, next: Record<string, unknown>) =>
      setModalSpy(next)
    ),
  };
});

vi.mock('./url-preview', () => ({
  UrlPreviewHolder: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="url-preview-holder">{children}</div>
  ),
  UrlPreviewCard: ({ url }: { url: string }) => <div data-testid="url-preview-card">{url}</div>,
  ClientPreview: ({ url }: { url: string }) => <div data-testid="client-preview">{url}</div>,
  youtubeUrl: () => false,
}));

vi.mock('./message/PollEvent', () => ({
  PollEvent: () => <div data-testid="poll-event" />,
}));

const matrixClient = {
  getAccountData: () => undefined,
  on: () => undefined,
  removeListener: () => undefined,
} as never;

function renderMessage(body: string) {
  return renderMessageWithContent({ body });
}

function renderMessageWithContent(content: Record<string, unknown>, room?: unknown) {
  return render(
    <ClientConfigProvider value={{}}>
      <MatrixClientProvider value={matrixClient}>
        <RenderMessageContent
          displayName="Alice"
          msgType={typeof content.msgtype === 'string' ? content.msgtype : (MsgType.Text as string)}
          ts={0}
          getContent={() => content as never}
          urlPreview
          clientUrlPreview
          htmlReactParserOptions={{}}
          linkifyOpts={{}}
          room={room as never}
        />
      </MatrixClientProvider>
    </ClientConfigProvider>
  );
}

function renderFileMessage(content: Record<string, unknown>) {
  return render(
    <ClientConfigProvider value={{}}>
      <MatrixClientProvider value={matrixClient}>
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

const externalGifContent = {
  msgtype: MsgType.Text,
  body: 'https://klipy.com/gif/reaction',
  'pet.plz.gif': {
    v: 1,
    provider: 'klipy',
    media_url: 'https://static.klipy.com/ii/reaction.gif',
    w: 480,
    h: 270,
  },
};

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

  it('does not request external GIF media by default in encrypted rooms', () => {
    renderMessageWithContent(externalGifContent, {
      hasEncryptionStateEvent: () => true,
    });

    expect(screen.getByText(externalGifContent.body)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load GIF' })).toBeInTheDocument();
  });

  it('keeps normal URL previews when external GIF metadata is invalid', () => {
    renderMessageWithContent({
      msgtype: MsgType.Text,
      body: 'https://example.com',
      'pet.plz.gif': {
        v: 1,
        provider: 'klipy',
        media_url: 'https://attacker.example/track.gif',
        w: 480,
        h: 270,
      },
    });

    expect(screen.getByTestId('url-preview-card')).toHaveTextContent('https://example.com');
  });

  it('renders historical Soliditas MXC GIFs through the external GIF path', () => {
    renderMessageWithContent(
      {
        msgtype: MsgType.Image,
        body: 'Reaction',
        url: 'mxc://gifs.sable.moe/klipy_ZXhhbXBsZS5naWY',
        info: { w: 480, h: 270, mimetype: 'image/gif' },
      },
      { hasEncryptionStateEvent: () => true }
    );

    expect(screen.getByRole('button', { name: 'Load GIF' })).toBeInTheDocument();
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

const roomWithEdits = {
  getTimelineForEvent: () => ({
    getTimelineSet: () => ({
      relations: {
        getChildEventsForEvent: () => ({
          getRelations: () => [{ getTs: () => 1710000000000 }],
        }),
      },
    }),
  }),
  hasEncryptionStateEvent: () => false,
};

const messageEvent = {
  getId: () => '$evt:example.com',
  getType: () => 'm.room.message',
  getTs: () => 1700000000000,
};

function renderEditedMessage(room?: unknown) {
  return render(
    <ClientConfigProvider value={{}}>
      <MatrixClientProvider value={matrixClient}>
        <RenderMessageContent
          displayName="Alice"
          msgType={MsgType.Text as string}
          ts={1700000000000}
          edited
          getContent={() => ({ msgtype: MsgType.Text, body: 'hello world' }) as never}
          htmlReactParserOptions={{}}
          linkifyOpts={{}}
          room={room as never}
          mEvent={messageEvent as never}
        />
      </MatrixClientProvider>
    </ClientConfigProvider>
  );
}

describe('edited indicator', () => {
  beforeEach(() => {
    setModalSpy.mockClear();
  });

  it('opens version history on click with the same modal payload as the context menu', () => {
    renderEditedMessage(roomWithEdits);

    const indicator = screen.getByText('(edited)');
    expect(indicator).toHaveAttribute('role', 'button');

    fireEvent.click(indicator);

    expect(setModalSpy).toHaveBeenCalledTimes(1);
    expect(setModalSpy).toHaveBeenCalledWith({
      type: ModalType.EditHistory,
      room: roomWithEdits,
      mEvent: messageEvent,
    });
  });

  it('keeps the tooltip-capable wrapper around the clickable indicator', () => {
    renderEditedMessage(roomWithEdits);

    const wrapper = screen.getByText('(edited)').closest('span[style*="inline"]');
    expect(wrapper?.firstElementChild).toHaveAttribute('role', 'button');
  });

  it('stops propagation so surrounding message click handlers do not fire', () => {
    const outsideClick = vi.fn<(event: Event) => void>();
    document.addEventListener('click', outsideClick);

    try {
      renderEditedMessage(roomWithEdits);

      fireEvent.click(screen.getByText('(edited)'));

      expect(setModalSpy).toHaveBeenCalledTimes(1);
      expect(outsideClick).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('click', outsideClick);
    }
  });

  it('opens version history on Enter and Space keys', () => {
    renderEditedMessage(roomWithEdits);

    fireEvent.keyDown(screen.getByText('(edited)'), { key: 'Enter' });
    expect(setModalSpy).toHaveBeenCalledTimes(1);
    expect(setModalSpy).toHaveBeenCalledWith({
      type: ModalType.EditHistory,
      room: roomWithEdits,
      mEvent: messageEvent,
    });

    fireEvent.keyDown(screen.getByText('(edited)'), { key: ' ' });
    expect(setModalSpy).toHaveBeenCalledTimes(2);
  });

  it('is not interactive when the event context is missing', () => {
    renderEditedMessage();

    expect(screen.queryByRole('button', { name: '(edited)' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('(edited)'));
    expect(setModalSpy).not.toHaveBeenCalled();
  });
});
