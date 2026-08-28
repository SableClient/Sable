import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorPage } from './DefaultErrorPage';

const { captureFeedback, isInitialized, isMobileTauri, openUrl, showReportDialog } = vi.hoisted(
  () => ({
    captureFeedback: vi.fn<(feedback: unknown) => void>(),
    isInitialized: vi.fn<() => boolean>(),
    isMobileTauri: vi.fn<() => boolean>(),
    openUrl: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    showReportDialog: vi.fn<(options: { eventId?: string }) => void>(),
  })
);

vi.mock('@sentry/react', () => ({
  captureFeedback,
  isInitialized,
  showReportDialog,
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
}));

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }));

vi.mock('$utils/platform', () => ({
  isMobileOrTablet: () => false,
  isMobileTauri,
}));

vi.mock('$features/bug-report', () => ({
  buildGitHubUrl: () => 'https://github.com/SableClient/Sable/issues/new',
}));

describe('ErrorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isInitialized.mockReturnValue(true);
  });

  it('uses native feedback and URL opening on mobile Tauri', () => {
    isMobileTauri.mockReturnValue(true);
    render(<ErrorPage error={new Error('Test error')} eventId="event-id" />);

    fireEvent.change(screen.getByPlaceholderText(/what were you doing/i), {
      target: { value: 'I was opening a gallery.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Details to Report' }));

    expect(captureFeedback).toHaveBeenCalledWith({
      message: 'I was opening a gallery.',
      name: 'Crash report follow-up',
      associatedEventId: 'event-id',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Also Report on GitHub' }));
    expect(openUrl).toHaveBeenCalledOnce();
  });

  it('keeps the Sentry dialog on non-mobile platforms', () => {
    isMobileTauri.mockReturnValue(false);
    render(<ErrorPage error={new Error('Test error')} eventId="event-id" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Details to Report' }));

    expect(showReportDialog).toHaveBeenCalledWith({ eventId: 'event-id' });
  });
});
