import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCallToneSources } from './callToneSources';

vi.mock('./callRingtoneStorage', () => ({
  getCustomCallRingtone: vi.fn<() => Promise<Blob | undefined>>(),
  getCustomCallRingback: vi.fn<() => Promise<Blob | undefined>>(),
}));

const { getCustomCallRingtone, getCustomCallRingback } = await import('./callRingtoneStorage');

describe('resolveCallToneSources', () => {
  beforeEach(() => {
    vi.mocked(getCustomCallRingtone).mockReset();
    vi.mocked(getCustomCallRingback).mockReset();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn<() => string>(() => 'blob:custom'),
        revokeObjectURL: vi.fn<() => void>(),
      })
    );
  });

  it('resolves built-in tones without loading custom storage', async () => {
    const resolved = await resolveCallToneSources({
      callRingtoneId: 'sable-default',
      callRingbackTone: 'sable-default',
    });

    expect(resolved.incomingUrl).toBeTruthy();
    expect(resolved.outgoingUrl).toBeTruthy();
    expect(getCustomCallRingtone).not.toHaveBeenCalled();
    expect(getCustomCallRingback).not.toHaveBeenCalled();
    resolved.revoke();
  });

  it('loads custom blobs when custom tones are selected', async () => {
    vi.mocked(getCustomCallRingtone).mockResolvedValue({
      blob: new Blob(['a'], { type: 'audio/mpeg' }),
      name: 'ring.mp3',
      sizeBytes: 4,
      durationMs: 1000,
    });
    vi.mocked(getCustomCallRingback).mockResolvedValue({
      blob: new Blob(['b'], { type: 'audio/mpeg' }),
      name: 'back.mp3',
      sizeBytes: 4,
      durationMs: 1000,
    });

    const resolved = await resolveCallToneSources({
      callRingtoneId: 'custom',
      callRingbackTone: 'custom',
    });

    expect(getCustomCallRingtone).toHaveBeenCalled();
    expect(getCustomCallRingback).toHaveBeenCalled();
    expect(resolved.customRingtoneObjectUrl).toBe('blob:custom');
    resolved.revoke();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
