import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextViewer } from './TextViewer';
import * as css from './TextViewer.css';

const { copyToClipboard, CodeHighlightRenderer } = vi.hoisted(() => ({
  copyToClipboard: vi.fn<() => Promise<void>>(),
  CodeHighlightRenderer: vi.fn<
    (props: { code: string; language?: string; allowDetect?: boolean }) => JSX.Element
  >(({ code, language, allowDetect }) => (
    <code
      data-testid="highlight"
      data-language={language}
      data-allow-detect={String(Boolean(allowDetect))}
    >
      {code}
    </code>
  )),
}));

vi.mock('$utils/dom', () => ({
  copyToClipboard,
}));

vi.mock('$components/code-highlight', () => ({
  CodeHighlightRenderer,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('TextViewer', () => {
  it('uses the shared code highlight renderer and keeps Copy All working', async () => {
    const user = userEvent.setup();

    render(
      <TextViewer
        name="notes.txt"
        text={'line 1\nline 2'}
        langName="txt"
        requestClose={vi.fn<() => void>()}
      />
    );

    expect(CodeHighlightRenderer).toHaveBeenCalled();
    expect(CodeHighlightRenderer.mock.calls[0]?.[0]).toMatchObject({
      code: 'line 1\nline 2',
      language: 'txt',
      allowDetect: true,
    });

    await user.click(screen.getByText('Copy All'));

    expect(copyToClipboard).toHaveBeenCalledWith('line 1\nline 2');
    expect(screen.getByTestId('highlight')).toHaveTextContent('line 1 line 2');
    expect(screen.getByTestId('highlight').closest('pre')).toHaveClass(css.TextViewerPre);
  });
});
