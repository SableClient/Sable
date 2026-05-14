import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { matrixSpoilerExtension } from './matrix-spoiler';
import {
  matrixMathBlockExtension,
  matrixMathExtension,
  shieldDollarRunsForMarked,
} from './matrix-math';
import { matrixSubscriptExtension } from './matrix-subscript';

function parse(input: string): string {
  const processor = marked.use({
    extensions: [
      matrixSpoilerExtension,
      matrixMathExtension,
      matrixMathBlockExtension,
      matrixSubscriptExtension,
    ],
  });
  return processor.parse(shieldDollarRunsForMarked(input)) as string;
}

describe('matrixSpoilerExtension', () => {
  it('parses ||spoiler|| syntax', () => {
    expect(parse('Hello ||spoiler|| world')).toContain('data-mx-spoiler');
    expect(parse('Hello ||spoiler|| world')).toContain('>spoiler<');
  });

  it('does not parse text without spoiler markers', () => {
    expect(parse('No spoilers here')).not.toContain('data-mx-spoiler');
  });

  it('parses ||hidden|| without surrounding text', () => {
    const result = parse('||hidden||');
    expect(result).toContain('data-mx-spoiler');
    expect(result).toContain('>hidden<');
  });
});

describe('matrixMathExtension (inline)', () => {
  it('parses inline $...$ syntax', () => {
    expect(parse('$E = mc^2$')).toContain('data-mx-maths');
    expect(parse('$E = mc^2$')).toContain('E = mc^2');
  });

  it('parses inline math within text', () => {
    const result = parse('Math: $x$ value');
    expect(result).toContain('data-mx-maths');
    expect(result).toContain('>x<');
  });

  it('does not parse unmatched $', () => {
    expect(parse('No $ math here')).not.toContain('data-mx-maths');
  });

  it('does not parse dollar amounts in a sentence as inline math', () => {
    const input = 'I just bought something for $10 on sale, it was originally $20!';
    const result = parse(input);
    expect(result).not.toContain('data-mx-maths');
    expect(result).toContain('$10');
    expect(result).toContain('$20');
  });

  it('does not treat $ as math when the opening is followed by whitespace', () => {
    expect(parse('$ E = mc^2$')).not.toContain('data-mx-maths');
  });

  it('still parses valid inline math', () => {
    expect(parse('$E = mc^2$')).toContain('data-mx-maths');
    expect(parse('$2+2$')).toContain('data-mx-maths');
  });

  it('does not parse inline math when inner trims to empty (e.g. zero-width only)', () => {
    expect(parse(`empty $\u200B$ here`)).not.toContain('data-mx-maths');
  });

  it('does not parse long runs of dollar signs as inline math', () => {
    expect(parse('hey $$$$$$$ there')).not.toContain('data-mx-maths');
  });

  it('does not parse block math when inner is only whitespace or dollars', () => {
    expect(parse('$$  $$')).not.toContain('data-mx-maths');
    expect(parse('$$ $ $$')).not.toContain('data-mx-maths');
  });
});

describe('matrixMathBlockExtension (block)', () => {
  it('parses block $$...$$ syntax', () => {
    const result = parse('$$\\frac{a}{b}$$');
    expect(result).toContain('data-mx-maths');
    expect(result).toContain('<div');
  });

  it('does not parse inline $ as block', () => {
    const result = parse('$x$');
    expect(result).not.toContain('<div');
    expect(result).toContain('data-mx-maths');
    expect(result).toContain('<span');
  });
});

describe('matrixSubscriptExtension', () => {
  it('parses -# syntax', () => {
    const result = parse('-# subscript text');
    expect(result).toContain('<sub');
    expect(result).toContain('data-md="-#"');
  });
});
