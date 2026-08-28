/* oxlint-disable typescript/no-explicit-any, vitest/require-mock-type-parameters */

import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioMessageRecorder, type AudioMessageRecorderHandle } from './AudioMessageRecorder';

const recorderState = vi.hoisted(() => ({
  handleStop: vi.fn(),
  handleDelete: vi.fn(),
  onStop: undefined as ((payload: any) => void) | undefined,
  onDelete: undefined as (() => void) | undefined,
}));

vi.mock('$plugins/voice-recorder-kit', () => ({
  useVoiceRecorder: ({ onStop, onDelete }: any) => {
    recorderState.onStop = onStop;
    recorderState.onDelete = onDelete;
    return {
      levels: [],
      seconds: 0,
      error: undefined,
      handleStop: recorderState.handleStop,
      handleDelete: recorderState.handleDelete,
    };
  },
}));
vi.mock('$hooks/useElementSizeObserver', () => ({ useElementSizeObserver: () => {} }));
vi.mock('folds', () => ({
  Box: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
}));

const payload = {
  audioFile: new Blob(['audio'], { type: 'audio/ogg' }),
  waveform: [0.5],
  audioLength: 1,
  audioCodec: 'audio/ogg',
};

function renderRecorder() {
  const ref = createRef<AudioMessageRecorderHandle>();
  const onRecordingComplete = vi.fn();
  const result = render(
    <AudioMessageRecorder
      ref={ref}
      onRecordingComplete={onRecordingComplete}
      onRequestClose={vi.fn()}
      onWaveformUpdate={vi.fn()}
      onAudioLengthUpdate={vi.fn()}
    />
  );
  return { ref, onRecordingComplete, result };
}

beforeEach(() => {
  vi.useFakeTimers();
  recorderState.handleStop.mockReset();
  recorderState.handleDelete.mockReset();
  recorderState.onStop = undefined;
  recorderState.onDelete = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AudioMessageRecorder lifecycle', () => {
  it('makes stop idempotent and surfaces one completion', () => {
    const { ref, onRecordingComplete } = renderRecorder();

    act(() => {
      ref.current?.stop();
      ref.current?.stop();
      recorderState.onStop?.(payload);
      recorderState.onStop?.(payload);
    });

    expect(recorderState.handleStop).toHaveBeenCalledOnce();
    expect(onRecordingComplete).toHaveBeenCalledOnce();
  });

  it('makes delayed cancel idempotent and cancels its timer on unmount', () => {
    const { ref, result } = renderRecorder();

    act(() => {
      ref.current?.cancel();
      ref.current?.cancel();
      vi.advanceTimersByTime(180);
    });
    expect(recorderState.handleDelete).toHaveBeenCalledOnce();

    result.unmount();
    act(() => vi.runOnlyPendingTimers());
    expect(recorderState.handleDelete).toHaveBeenCalledOnce();
  });

  it('does not delete after cancel is followed by unmount before the delay', () => {
    const { ref, result } = renderRecorder();

    act(() => ref.current?.cancel());
    result.unmount();
    act(() => vi.advanceTimersByTime(180));

    expect(recorderState.handleDelete).not.toHaveBeenCalled();
  });
});
