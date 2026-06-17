import { describe, expect, it } from 'vitest';
import { parseMfmColorFnArgs, tryParseMfmColor } from './matrix-mfm-color';
import { markdownToHtml } from '$plugins/markdown/markdownToHtml';
import { htmlToMarkdown } from '$plugins/markdown/htmlToMarkdown';

describe('tryParseMfmColor', () => {
  it('parses a color function block', () => {
    const src = '$[fg.color=ff0000 red text]';
    expect(tryParseMfmColor(src)).toMatchObject({
      text: 'red text',
      dataMd: '$[fg.color=ff0000',
    });
  });
});

describe('parseMfmColorFnArgs', () => {
  it('parses fg only', () => {
    expect(parseMfmColorFnArgs('fg.color=ff0000')).toEqual({ fg: '#ff0000' });
  });

  it('parses fg and bg', () => {
    expect(parseMfmColorFnArgs('fg.color=ff0000 bg.color=00ff00')).toEqual({
      fg: '#ff0000',
      bg: '#00ff00',
    });
  });

  it('expands 3-digit hex', () => {
    expect(parseMfmColorFnArgs('fg.color=fff')).toEqual({ fg: '#ffffff' });
  });
});

describe('matrixMfmColorExtension', () => {
  it('converts fg.color to data-mx-color', () => {
    const html = markdownToHtml('$[fg.color=ff0000 red text]');
    expect(html).toContain('data-mx-color="#ff0000"');
    expect(html).toContain('red text');
  });

  it('converts bg.color with 3-digit hex', () => {
    const html = markdownToHtml('$[bg.color=0f0 highlighted]');
    expect(html).toContain('data-mx-bg-color="#00ff00"');
  });

  it('does not parse 4- or 8-digit hex (no alpha)', () => {
    expect(markdownToHtml('$[fg.color=ff00 no color]')).not.toContain('data-mx-color');
    expect(markdownToHtml('$[fg.color=ff0000ff no color]')).not.toContain('data-mx-color');
  });

  it('round-trips via htmlToMarkdown', () => {
    const md = '$[fg.color=f00 hello]';
    const html = markdownToHtml(md);
    expect(htmlToMarkdown(html)).toBe(md);
  });
});
