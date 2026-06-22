import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as css from './layout.css';
import { BubbleLayout } from './Bubble';

describe('BubbleLayout', () => {
  it('keeps the upstream left-aligned bubble structure', () => {
    const { container } = render(
      <BubbleLayout before={<div data-testid="avatar" />} header={<div>Header</div>}>
        <div>Message</div>
      </BubbleLayout>
    );

    const root = container.firstElementChild;
    expect(root).not.toBeNull();

    const avatarSlot = screen.getByTestId('avatar').parentElement;
    expect(avatarSlot).toHaveClass(css.BubbleBefore);

    const wrapper = screen.getByText('Message').parentElement?.parentElement;
    expect(wrapper).toHaveClass(css.BubbleWrapper);

    const bubble = screen.getByText('Message').parentElement;
    expect(bubble).toHaveClass(css.BubbleContent);
    expect(bubble).toHaveClass(css.BubbleContentArrowLeft);
  });

  it('mirrors the avatar gutter and arrow direction for right-aligned bubbles', () => {
    render(
      <BubbleLayout
        align="right"
        before={<div data-testid="right-avatar" />}
        header={<div>Right header</div>}
      >
        <div>Right message</div>
      </BubbleLayout>
    );

    const avatarSlot = screen.getByTestId('right-avatar').parentElement;
    expect(avatarSlot).toHaveClass(css.BubbleBefore);

    const bubble = screen.getByText('Right message').parentElement;
    expect(bubble).toHaveClass(css.BubbleContent);
    expect(bubble).toHaveClass(css.BubbleContentArrowRight);
  });

  it('renders raw children when the bubble wrapper is hidden', () => {
    render(
      <BubbleLayout hideBubble before={<div data-testid="hidden-avatar" />}>
        <div data-testid="raw-message">Raw message</div>
      </BubbleLayout>
    );

    expect(screen.getByTestId('raw-message').parentElement).not.toHaveClass(css.BubbleContent);
    expect(screen.queryByText('Raw message')?.parentElement).not.toHaveClass(css.BubbleWrapper);
  });
});
