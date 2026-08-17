import { describe, expect, it } from 'vitest';
import type { MatrixEvent } from '$types/matrix-sdk';
import { previewableLinks, rowsByDistance } from './useUrlPreviewPrefetch';

const textEvent = (body: string, msgtype = 'm.text'): MatrixEvent =>
  ({ getContent: () => ({ msgtype, body }) }) as unknown as MatrixEvent;

describe('previewableLinks', () => {
  it('finds every http(s) link in the body', () => {
    expect(previewableLinks(textEvent('see https://a.example/x and http://b.example'))).toEqual([
      'https://a.example/x',
      'http://b.example',
    ]);
  });

  it('skips permalinks, which never carry a preview', () => {
    expect(previewableLinks(textEvent('hi https://matrix.to/#/@a:b.example'))).toEqual([]);
  });

  it('skips message types that render no preview', () => {
    expect(previewableLinks(textEvent('https://a.example', 'm.image'))).toEqual([]);
  });

  it('tolerates a body that is missing or not a string', () => {
    expect(previewableLinks({ getContent: () => ({ msgtype: 'm.text' }) } as MatrixEvent)).toEqual(
      []
    );
  });

  it('leaves a trailing bracket out of the url', () => {
    expect(previewableLinks(textEvent('(https://a.example/x)'))).toEqual(['https://a.example/x']);
  });
});

describe('rowsByDistance', () => {
  it('walks outward from both edges of the rendered window', () => {
    expect(rowsByDistance(5, 7, 100, 3)).toEqual([4, 8, 3, 9, 2, 10]);
  });

  it('stays inside the row range', () => {
    expect(rowsByDistance(1, 8, 10, 3)).toEqual([0, 9]);
  });
});
