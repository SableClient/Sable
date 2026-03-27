import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeHighlightRenderer } from '.';

const { highlightCode, useArboriumThemeStatus } = vi.hoisted(() => ({
  highlightCode: vi.fn(),
  useArboriumThemeStatus: vi.fn(),
}));

vi.mock('$plugins/arborium', () => ({
  highlightCode,
  useArboriumThemeStatus,
}));

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
});
