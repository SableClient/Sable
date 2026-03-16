import type { CSSProperties, ReactNode } from 'react';

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

export type VoiceRecorderProps = UseVoiceRecorderOptions & {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: string | number;
  padding?: string | number;
  gap?: string | number;
  recordingIndicatorColor?: string;
  idleIndicatorColor?: string;
  timeTextColor?: string;
  timeFontSize?: string | number;
  timeFontWeight?: string | number;
  timeFontFamily?: string;
  visualizerBarColor?: string | ((level: number, index: number) => string);
  visualizerBarWidth?: number;
  visualizerBarGap?: number;
  visualizerBarHeight?: number;
  visualizerHeight?: number;
  buttonSize?: number;
  buttonBackgroundColor?: string;
  buttonBorderColor?: string;
  buttonBorderRadius?: string | number;
  buttonHoverBackgroundColor?: string;
  buttonGap?: number;
  errorTextColor?: string;
  errorFontSize?: string | number;
  errorFontFamily?: string;
  customPlayIcon?: ReactNode;
  customPauseIcon?: ReactNode;
  customStopIcon?: ReactNode;
  customResumeIcon?: ReactNode;
  customDeleteIcon?: ReactNode;
  customRepeatIcon?: ReactNode;
  iconSize?: number;
  iconColor?: string;
};
