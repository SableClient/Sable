import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EventType, MsgType } from '$types/matrix-sdk';
import {
  Reply,
  replyFormattedPreviewTextOnly,
  replyPreviewBodyForTimelineEvent,
  shouldParseReplyFormattedPreview,
} from './Reply';

/* oxlint-disable typescript/no-explicit-any */

const { mockUseRoomEvent, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUseRoomEvent:
    vi.fn<(_room: unknown, _replyEventId: unknown, _getFromLocalTimeline: unknown) => unknown>(),
  mockInvalidateQueries: vi.fn<() => Promise<void>>(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock('jotai', async (importActual) => {
  const actual = (await importActual()) as object;
  return {
    ...actual,
    useAtomValue: () => ({}),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('$hooks/useRoomEvent', () => ({
  useRoomEvent: (...args: unknown[]) => mockUseRoomEvent(args[0], args[1], args[2]),
}));

vi.mock('$hooks/useSableCosmetics', () => ({
  useSableCosmetics: () => ({ color: undefined, font: undefined }),
}));

vi.mock('$hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));

vi.mock('$hooks/useRenderableMediaUrl', () => ({
  useRenderableMediaUrl: (src: string | undefined) => src,
}));

vi.mock('$hooks/useIgnoredUsers', () => ({
  useIgnoredUsers: () => [],
}));

const mockMxcUrlToHttp = vi.fn<() => string | null>(() => null);

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () =>
    ({
      getRoom: () => undefined,
      getUserId: () => '@me:example.com',
      mxcUrlToHttp: () => mockMxcUrlToHttp(),
    }) as any,
}));

vi.mock('$hooks/useMemberEventParser', () => ({
  useMemberEventParser: () => vi.fn<() => unknown>(),
}));

vi.mock('$hooks/useMentionClickHandler', () => ({
  useMentionClickHandler: () => undefined,
}));

vi.mock('$features/settings/useSettingsLinkBaseUrl', () => ({
  useSettingsLinkBaseUrl: () => 'https://app.sable.moe',
}));

vi.mock('$utils/room', async (importActual) => {
  const actual = (await importActual()) as object;
  return {
    ...actual,
    getMemberDisplayName: () => 'Alice',
  };
});

const createReplyEvent = (formattedBody: string) =>
  ({
    getContent: () => ({
      body: 'fallback body',
      format: 'org.matrix.custom.html',
      formatted_body: formattedBody,
      msgtype: 'm.text',
    }),
    getSender: () => '@alice:example.com',
    getType: () => 'm.room.message',
    isRedacted: () => false,
    isEncrypted: () => false,
    isDecryptionFailure: () => false,
    getClearContent: () => ({}),
  }) as any;

describe('shouldParseReplyFormattedPreview', () => {
  it('returns false for empty html', () => {
    expect(shouldParseReplyFormattedPreview('')).toBe(false);
  });

  it('returns true when html has visible text', () => {
    expect(shouldParseReplyFormattedPreview('<p>hello</p>')).toBe(true);
  });

  it('returns true for custom emoji img tags without surrounding text', () => {
    expect(
      shouldParseReplyFormattedPreview(
        '<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" height="32" />'
      )
    ).toBe(true);
  });

  it('returns false for non-emoticon image-only html', () => {
    expect(
      shouldParseReplyFormattedPreview('<img src="mxc://example.org/image" alt="photo" />')
    ).toBe(false);
  });
});

describe('replyFormattedPreviewTextOnly', () => {
  it('strips tags and collapses whitespace', () => {
    expect(replyFormattedPreviewTextOnly('<p>hi <b>there</b></p>')).toBe('hi there');
  });
});

describe('replyPreviewBodyForTimelineEvent', () => {
  it('uses filename for image messages with an empty body', () => {
    const { container } = render(
      <span>
        {replyPreviewBodyForTimelineEvent(
          EventType.RoomMessage as string,
          {
            msgtype: MsgType.Image,
            body: '',
            filename: 'vacation.png',
          },
          false
        )}
      </span>
    );
    expect(container).toHaveTextContent('vacation.png');
  });

  it('falls back to Image when an image message has no body or filename', () => {
    const { container } = render(
      <span>
        {replyPreviewBodyForTimelineEvent(
          EventType.RoomMessage as string,
          {
            msgtype: MsgType.Image,
            body: '',
          },
          false
        )}
      </span>
    );
    expect(container).toHaveTextContent('Image');
  });

  it('renders deleted content for redacted timeline messages', () => {
    render(
      <span>
        {replyPreviewBodyForTimelineEvent(
          EventType.RoomMessage as string,
          { msgtype: MsgType.Text },
          true
        )}
      </span>
    );
    expect(screen.getByText(/This message has been deleted/i)).toBeInTheDocument();
  });

  it('shows Sticker when a sticker event has no body', () => {
    const { container } = render(
      <span>
        {replyPreviewBodyForTimelineEvent(EventType.Sticker as string, { body: '' }, false)}
      </span>
    );
    expect(container).toHaveTextContent('Sticker');
  });
});

const createImageReplyEvent = (filename?: string) =>
  ({
    getContent: () => ({
      msgtype: MsgType.Image,
      body: '',
      ...(filename !== undefined ? { filename } : {}),
    }),
    getSender: () => '@alice:example.com',
    getType: () => EventType.RoomMessage,
    isRedacted: () => false,
    isEncrypted: () => false,
    isDecryptionFailure: () => false,
    getClearContent: () => ({ msgtype: MsgType.Image }),
    isState: () => false,
  }) as any;

describe('Reply', () => {
  it('shows an image filename in the reply chip when the body is blank', () => {
    mockUseRoomEvent.mockReturnValue(createImageReplyEvent('screenshot.png'));

    render(
      <Reply
        room={{ roomId: '!room:example.com', getMember: () => undefined } as any}
        replyEventId="$reply:example.com"
      />
    );

    expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    expect(screen.queryByText(/state event/i)).not.toBeInTheDocument();
  });

  it('sanitizes formatted_body before trimming and parsing the reply preview', () => {
    mockUseRoomEvent.mockReturnValue(
      createReplyEvent(
        '<mx-reply><blockquote>quoted<script>alert(1)</script></blockquote></mx-reply>' +
          '<span data-mx-color="#ff0000" style="color:#00ff00">visible</span>' +
          '<img src="https://example.com/not-allowed.png" alt="blocked image" />'
      )
    );

    render(
      <Reply
        room={{ roomId: '!room:example.com', getMember: () => undefined } as any}
        replyEventId="$reply:example.com"
      />
    );

    expect(screen.getByText('visible')).toBeInTheDocument();
    expect(screen.queryByText('quoted')).not.toBeInTheDocument();
    expect(screen.queryByText('alert(1)')).not.toBeInTheDocument();
    expect(screen.queryByAltText('blocked image')).not.toBeInTheDocument();
  });

  it('renders custom emoji in the reply chip when formatted_body is image-only', () => {
    mockMxcUrlToHttp.mockReturnValue('https://cdn.example/emote.png');

    mockUseRoomEvent.mockReturnValue(
      createReplyEvent(
        '<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" height="32" />'
      )
    );

    const { container } = render(
      <Reply
        room={{ roomId: '!room:example.com', getMember: () => undefined } as any}
        replyEventId="$reply:example.com"
      />
    );

    expect(screen.queryByText(/Failed to load message/i)).not.toBeInTheDocument();
    expect(container.querySelector('img[src="https://cdn.example/emote.png"]')).not.toBeNull();
  });

  it('falls back to plain body text when formatted_body is a non-emoticon image only', () => {
    mockUseRoomEvent.mockReturnValue({
      getContent: () => ({
        body: '😀',
        format: 'org.matrix.custom.html',
        formatted_body: '<img src="mxc://example.org/twemoji" alt="😀" />',
        msgtype: 'm.text',
      }),
      getSender: () => '@alice:example.com',
      getType: () => 'm.room.message',
      isRedacted: () => false,
      isEncrypted: () => false,
      isDecryptionFailure: () => false,
      getClearContent: () => ({}),
    } as any);

    render(
      <Reply
        room={{ roomId: '!room:example.com', getMember: () => undefined } as any}
        replyEventId="$reply:example.com"
      />
    );

    expect(screen.getByText('😀')).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load message/i)).not.toBeInTheDocument();
  });

  it('does not render unresolved mxc images as raw browser img tags in reply previews', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn<() => void>());

    mockUseRoomEvent.mockReturnValue(
      createReplyEvent(
        '<img data-mx-emoticon src="mxc://mozilla.org/ca2ed58example" alt="blobcat" title="blobcat" height="32" />'
      )
    );

    const { container } = render(
      <Reply
        room={{ roomId: '!room:example.com', getMember: () => undefined } as any}
        replyEventId="$reply:example.com"
      />
    );

    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
