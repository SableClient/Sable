import { render, waitFor } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeHighlightRenderer } from '.';
import * as css from './CodeHighlightRenderer.css';

const { highlightCode, useArboriumThemeStatus } = vi.hoisted(() => ({
  highlightCode:
    vi.fn<() => Promise<{ mode: 'highlighted' | 'plain'; html: string; language: string }>>(),
  useArboriumThemeStatus: vi.fn<() => { ready: boolean }>(),
}));

vi.mock('$plugins/arborium', () => ({
  highlightCode,
  useArboriumThemeStatus,
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('CodeHighlightRenderer', () => {
  it('renders highlighted HTML when Arborium succeeds and theme is ready', async () => {
    highlightCode.mockResolvedValue({
      mode: 'highlighted',
      html: '<span class="token keyword">const</span> value = 1;',
      language: 'typescript',
    });
    useArboriumThemeStatus.mockReturnValue({ ready: true });

    const { container } = render(
      <CodeHighlightRenderer code="const value = 1;" language="ts" allowDetect className="code" />
    );

    const code = container.querySelector('code');
    expect(code).toHaveClass('code');
    expect(code).toHaveClass(css.CodeHighlightCode);

    await waitFor(() => {
      expect(code?.innerHTML).toContain('<span class="token keyword">const</span>');
    });

    expect(code?.innerHTML).toContain('<span class="token keyword">const</span>');
    expect(highlightCode).toHaveBeenCalledWith({
      code: 'const value = 1;',
      language: 'ts',
      allowDetect: true,
    });
  });

  it('renders plain text when theme is not ready', async () => {
    highlightCode.mockResolvedValue({
      mode: 'highlighted',
      html: '<span class="token keyword">const</span> value = 1;',
      language: 'typescript',
    });
    useArboriumThemeStatus.mockReturnValue({ ready: false });

    const { container } = render(
      <CodeHighlightRenderer code="const value = 1;" language="ts" allowDetect />
    );

    const code = container.querySelector('code');

    await waitFor(() => {
      expect(code).toHaveTextContent('const value = 1;');
    });

    expect(code).toHaveClass(css.CodeHighlightCode);
    expect(code?.innerHTML).toBe('const value = 1;');
  });

  it('renders plain text when Arborium returns plain mode', async () => {
    highlightCode.mockResolvedValue({
      mode: 'plain',
      html: 'const value = 1;',
      language: 'ts',
    });
    useArboriumThemeStatus.mockReturnValue({ ready: true });

    const { container } = render(
      <CodeHighlightRenderer code="const value = 1;" language="ts" allowDetect />
    );

    const code = container.querySelector('code');

    await waitFor(() => {
      expect(code).toHaveTextContent('const value = 1;');
    });

    expect(code?.innerHTML).toBe('const value = 1;');
  });

  it('renders plain new code immediately while a new highlight request is pending', async () => {
    const firstHighlight = deferred<{
      mode: 'highlighted';
      html: string;
      language: string;
    }>();
    const secondHighlight = deferred<{
      mode: 'highlighted';
      html: string;
      language: string;
    }>();

    highlightCode
      .mockReturnValueOnce(firstHighlight.promise)
      .mockReturnValueOnce(secondHighlight.promise);
    useArboriumThemeStatus.mockReturnValue({ ready: true });

    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    flushSync(() => {
      root.render(<CodeHighlightRenderer code="const alpha = 1;" language="ts" allowDetect />);
    });

    firstHighlight.resolve({
      mode: 'highlighted',
      html: '<span class="token keyword">const</span> alpha = 1;',
      language: 'typescript',
    });

    await waitFor(() => {
      expect(host.querySelector('code')?.innerHTML).toContain('alpha');
    });

    flushSync(() => {
      root.render(<CodeHighlightRenderer code="const beta = 2;" language="ts" allowDetect />);
    });

    expect(host.querySelector('code')?.innerHTML).toBe('const beta = 2;');
    expect(host.querySelector('code')).not.toContainHTML('alpha');

    root.unmount();
    host.remove();
  });
});
