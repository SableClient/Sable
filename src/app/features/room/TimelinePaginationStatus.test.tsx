import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelinePaginationStatusRow } from './TimelinePaginationStatus';

describe('TimelinePaginationStatusRow', () => {
  it('does not render when hidden', () => {
    const { container } = render(
      <TimelinePaginationStatusRow
        direction="backward"
        eventsLength={10}
        hasMore
        status="loading"
        onRetry={vi.fn<() => void>()}
        hidden
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders retry UI on error', () => {
    const onRetry = vi.fn<() => void>();
    render(
      <TimelinePaginationStatusRow
        direction="backward"
        eventsLength={10}
        hasMore
        status="error"
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Failed to load history.')).toBeInTheDocument();
    screen.getByText('Retry').click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
