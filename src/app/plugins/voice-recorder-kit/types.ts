export type RecorderState = 'idle' | 'recording' | 'paused' | 'reviewing' | 'playing';

export type VoiceRecorderStopPayload = {
  audioFile: Blob;
  audioUrl: string;
  waveform: number[];
  audioLength: number;
  audioCodec: string;
};

export type UseVoiceRecorderOptions = {
  autoStart?: boolean;
  onStop?: (payload: VoiceRecorderStopPayload) => void;
  onDelete?: () => void;
};

export type UseVoiceRecorderReturn = {
  state: RecorderState;
  isRecording: boolean;
  isStopped: boolean;
  isTemporaryStopped: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  seconds: number;
  levels: number[];
  error: string | null;
  audioUrl: string | null;
  audioFile: File | null;
  waveform: number[] | null;
  start: () => void;
  handlePause: () => void;
  handleStopTemporary: () => void;
  handleStop: () => void;
  handleResume: () => void;
  handlePreviewPlay: () => void;
  handlePlay: () => void;
  handleRestart: () => void;
  handleDelete: () => void;
  handleRecordAgain: () => void;
};
