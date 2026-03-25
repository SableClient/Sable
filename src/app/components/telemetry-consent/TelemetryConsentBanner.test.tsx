import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TelemetryConsentBanner } from './TelemetryConsentBanner';

const SENTRY_KEY = 'sable_sentry_enabled';
const TEST_DSN = 'https://examplePublicKey@o0.ingest.sentry.io/0';

describe('TelemetryConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('location', { reload: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // ── visibility ────────────────────────────────────────────────────────────

  it('renders nothing when VITE_SENTRY_DSN is not configured', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { container } = render(<TelemetryConsentBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the user has already opted in', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    localStorage.setItem(SENTRY_KEY, 'true');
    const { container } = render(<TelemetryConsentBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the user has already opted out', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    localStorage.setItem(SENTRY_KEY, 'false');
    const { container } = render(<TelemetryConsentBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the banner when DSN is configured and no preference is saved', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    render(<TelemetryConsentBanner />);
    expect(screen.getByRole('region', { name: /crash reporting prompt/i })).toBeInTheDocument();
    expect(screen.getByText(/help improve sable/i)).toBeInTheDocument();
  });

  // ── accessibility ─────────────────────────────────────────────────────────

  it('has both action buttons visible', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    render(<TelemetryConsentBanner />);
    expect(screen.getByRole('button', { name: /enable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no thanks/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('includes a link to the privacy policy', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    render(<TelemetryConsentBanner />);
    expect(screen.getByRole('link', { name: /learn more/i })).toBeInTheDocument();
  });

  // ── "Enable" action ───────────────────────────────────────────────────────

  it('"Enable" saves opted-in preference to localStorage', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    render(<TelemetryConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /enable/i }));
    expect(localStorage.getItem(SENTRY_KEY)).toBe('true');
  });

  it('"Enable" reloads the page so Sentry initialises', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    render(<TelemetryConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /enable/i }));
    expect(window.location.reload).toHaveBeenCalledOnce();
  });

  // ── "No thanks" action ────────────────────────────────────────────────────

  it('"No thanks" saves opted-out preference to localStorage', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    render(<TelemetryConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(localStorage.getItem(SENTRY_KEY)).toBe('false');
  });

  it('"No thanks" does not reload the page', () => {
    vi.stubEnv('VITE_SENTRY_DSN', TEST_DSN);
    render(<TelemetryConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /no thanks/i }));
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
