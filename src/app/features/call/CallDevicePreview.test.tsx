import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallDevicePreview } from './CallDevicePreview';

const mocks = vi.hoisted(() => ({
  usePreviewTracks: vi.fn<() => unknown[] | undefined>(),
  useMediaDeviceSelect: vi.fn<(o: { kind: string }) => { devices: MediaDeviceInfo[] }>(),
  previewOptions: undefined as unknown,
  attach: vi.fn<(el: HTMLElement) => void>(),
  detach: vi.fn<(el: HTMLElement) => void>(),
}));

vi.mock('@livekit/components-react', () => ({
  // Mirror the real hook: it only returns tracks for the sources requested.
  usePreviewTracks: (options: { audio: unknown; video: unknown }) => {
    mocks.previewOptions = options;
    const tracks = mocks.usePreviewTracks() ?? [];
    return tracks.filter((track) => {
      const { kind } = track as { kind: string };
      return kind === 'video' ? options.video !== false : options.audio !== false;
    });
  },
  useMediaDeviceSelect: (options: { kind: string }) => mocks.useMediaDeviceSelect(options),
  useTrackVolume: () => 0.25,
}));

vi.mock('livekit-client', () => ({
  Track: { Kind: { Video: 'video', Audio: 'audio' } },
}));

const device = (deviceId: string, label: string, kind: string) =>
  ({ deviceId, label, kind }) as MediaDeviceInfo;

const videoTrack = { kind: 'video', attach: mocks.attach, detach: mocks.detach };
const audioTrack = { kind: 'audio' };

const props = {
  microphone: true,
  video: true,
  onAudioDeviceChange: vi.fn<(id: string) => void>(),
  onVideoDeviceChange: vi.fn<(id: string) => void>(),
};

beforeEach(() => {
  mocks.usePreviewTracks.mockReset().mockReturnValue([videoTrack, audioTrack]);
  mocks.useMediaDeviceSelect.mockReset().mockImplementation(({ kind }) => ({
    devices:
      kind === 'audioinput'
        ? [device('mic-1', 'Built-in Mic', kind), device('mic-2', 'USB Mic', kind)]
        : [device('cam-1', 'FaceTime HD', kind)],
  }));
  mocks.attach.mockReset();
  mocks.detach.mockReset();
  props.onAudioDeviceChange.mockReset();
  props.onVideoDeviceChange.mockReset();
});

describe('CallDevicePreview', () => {
  it('attaches the preview camera track to a video element', () => {
    render(<CallDevicePreview {...props} />);

    expect(mocks.attach).toHaveBeenCalledOnce();
    expect(screen.queryByText('Camera is off')).not.toBeInTheDocument();
  });

  it('detaches the camera track on unmount so the call can claim it', () => {
    const { unmount } = render(<CallDevicePreview {...props} />);
    unmount();

    expect(mocks.detach).toHaveBeenCalledOnce();
  });

  it('requests only the devices the user actually enabled', () => {
    render(<CallDevicePreview {...props} video={false} audioDeviceId="mic-2" />);

    expect(mocks.previewOptions).toEqual({ audio: { deviceId: 'mic-2' }, video: false });
    expect(screen.getByText('Camera is off')).toBeInTheDocument();
  });

  it('reports a chosen microphone so the call can honour it', async () => {
    render(<CallDevicePreview {...props} />);

    await userEvent.selectOptions(screen.getByLabelText('Microphone'), 'mic-2');

    expect(props.onAudioDeviceChange).toHaveBeenCalledWith('mic-2');
  });

  it('shows a microphone level only while the microphone is on', () => {
    const { rerender } = render(<CallDevicePreview {...props} />);
    expect(screen.getByRole('meter', { name: 'Microphone level' })).toBeInTheDocument();

    rerender(<CallDevicePreview {...props} microphone={false} />);
    expect(screen.queryByRole('meter', { name: 'Microphone level' })).not.toBeInTheDocument();
  });
});
