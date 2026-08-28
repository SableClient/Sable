import { describe, expect, it } from 'vitest';
import { labelUnifiedPushDistributorOption } from './SystemNotification';

const APP_ID = 'moe.sable.client';

describe('labelUnifiedPushDistributorOption', () => {
  it('names the in-app websocket distributor plainly', () => {
    expect(labelUnifiedPushDistributorOption('embedded-websocket', APP_ID)).toBe('Built-in');
  });

  /**
   * Embedded FCM registers under our own package, so it rendered as "client" — a label
   * that says nothing about what it does or that it routes through Google.
   */
  it('says what the old embedded-FCM entry actually is', () => {
    expect(labelUnifiedPushDistributorOption(APP_ID, APP_ID)).toBe('Built-in (old, via Google)');
  });

  it('names installed distributors by their last package segment', () => {
    expect(labelUnifiedPushDistributorOption('io.heckel.ntfy', APP_ID)).toBe('ntfy');
    expect(labelUnifiedPushDistributorOption('org.unifiedpush.distributor.nextpush', APP_ID)).toBe(
      'nextpush'
    );
  });

  /**
   * A previous version guessed our package by looking for a dot, which matched the first
   * installed distributor and labelled ntfy as this app.
   */
  it('never presents someone else as this app', () => {
    ['io.heckel.ntfy', 'org.unifiedpush.distributor.nextpush', 'moe.sable.next.debug'].forEach(
      (distributor) => {
        expect(labelUnifiedPushDistributorOption(distributor, APP_ID)).not.toContain('Built-in');
      }
    );
  });

  it('falls back to the segment when the identifier is not known yet', () => {
    expect(labelUnifiedPushDistributorOption(APP_ID)).toBe('client');
  });
});
