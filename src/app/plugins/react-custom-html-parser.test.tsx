import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from './react-custom-html-parser';

function createMatrixClient() {
  return {
    getRoom: () => undefined,
    getUserId: () => '@me:example.com',
    mxcUrlToHttp: () => null,
  } as any;
}

function renderParsedHtml(
  html: string,
  options: {
    sanitize?: boolean;
    mx?: any;
  } = {}
) {
  const { sanitize = true, mx = createMatrixClient() } = options;
  const parserOptions = getReactCustomHtmlParser(mx, '!room:example.com', {
    linkifyOpts: LINKIFY_OPTS,
  });

  return render(<div>{parse(sanitize ? sanitizeCustomHtml(html) : html, parserOptions)}</div>);
}

describe('getReactCustomHtmlParser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('translates Matrix color data attributes into rendered styles', () => {
    renderParsedHtml('<span data-mx-color="#ff0000" data-mx-bg-color="#00ff00">colored</span>');

    expect(screen.getByText('colored')).toHaveStyle({
      color: 'rgb(255, 0, 0)',
      backgroundColor: 'rgb(0, 255, 0)',
    });
  });

  it('drops incoming style attributes even if unsanitized html reaches the parser', () => {
    renderParsedHtml(
      '<span style="background-color:#00ff00" data-mx-color="#ff0000">styled</span>',
      { sanitize: false }
    );

    const styled = screen.getByText('styled');

    expect(styled).toHaveStyle({
      color: 'rgb(255, 0, 0)',
    });
    expect(styled).not.toHaveStyle({
      backgroundColor: 'rgb(0, 255, 0)',
    });
  });

  it('renders a readable fallback for unresolved legacy emote MXC images', () => {
    const { container } = renderParsedHtml(
      '<img data-mx-emoticon src="mxc://example.org/emote" alt="blobcat" title="blobcat" height="32" />'
    );

    expect(screen.getByText(':blobcat:')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders a readable fallback for unresolved non-emote MXC images', () => {
    const { container } = renderParsedHtml(
      '<img src="mxc://example.org/image" alt="media" title="media" />'
    );

    expect(screen.getByText('media')).toBeInTheDocument();
    expect(container.querySelector('img[src^="mxc://"]')).toBeNull();
  });

  it('renders unresolved MXC fallbacks without emitting debug logs', () => {
    const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    renderParsedHtml('<img src="mxc://example.org/image" alt="media" title="media" />');

    expect(logSpy).not.toHaveBeenCalled();
  });
});
