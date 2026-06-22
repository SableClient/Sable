import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as css from './layout.css';
import { BubbleLayout } from './Bubble';

describe('BubbleLayout', () => {
  it('applies the full-width row and fixed avatar gutter classes', () => {
    const { container } = render(
      <BubbleLayout before={<div data-testid="avatar" />} header={<div>Header</div>}>
        <div>Message</div>
      </BubbleLayout>
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass(css.BubbleRow);

    const avatar = screen.getByTestId('avatar').parentElement;
    expect(avatar).toHaveClass(css.BubbleBefore);

    const main = screen.getByText('Header').parentElement;
    expect(main).toHaveClass(css.BubbleMain);

    const bubbleWrapper = screen.getByText('Message').parentElement?.parentElement;
    expect(bubbleWrapper).toHaveClass(css.BubbleWrapper);
  });
});
