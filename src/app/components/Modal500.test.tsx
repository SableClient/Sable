import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal500 } from './Modal500';

describe('Modal500', () => {
  it('does not throw when rendered without tabbable children', () => {
    expect(() =>
      render(
        <Modal500 requestClose={vi.fn<() => void>()}>
          <div>Empty modal content</div>
        </Modal500>
      )
    ).not.toThrow();
  });
});
