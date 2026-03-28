import { render, screen } from '@testing-library/react';
import parse from 'html-react-parser';
import { describe, expect, it } from 'vitest';
import { sanitizeCustomHtml } from '$utils/sanitize';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from './react-custom-html-parser';

const createMatrixClient = () =>
  ({
    getRoom: () => undefined,
    getUserId: () => '@me:example.com',
    mxcUrlToHttp: () => null,
  }) as any;

describe('getReactCustomHtmlParser', () => {
  it('translates Matrix color data attributes into rendered styles', () => {
    const sanitizedHtml = sanitizeCustomHtml(
      '<span data-mx-color="#ff0000" data-mx-bg-color="#00ff00">colored</span>'
    );

    render(
      <div>
        {parse(
          sanitizedHtml,
          getReactCustomHtmlParser(createMatrixClient(), '!room:example.com', {
            linkifyOpts: LINKIFY_OPTS,
          })
        )}
      </div>
    );

    expect(screen.getByText('colored')).toHaveStyle({
      color: 'rgb(255, 0, 0)',
      backgroundColor: 'rgb(0, 255, 0)',
    });
  });

  it('drops incoming style attributes even if unsanitized html reaches the parser', () => {
    render(
      <div>
        {parse(
          '<span style="background-color:#00ff00" data-mx-color="#ff0000">styled</span>',
          getReactCustomHtmlParser(createMatrixClient(), '!room:example.com', {
            linkifyOpts: LINKIFY_OPTS,
          })
        )}
      </div>
    );

    const styled = screen.getByText('styled');

    expect(styled).toHaveStyle({
      color: 'rgb(255, 0, 0)',
    });
    expect(styled).not.toHaveStyle({
      backgroundColor: 'rgb(0, 255, 0)',
    });
  });
});
