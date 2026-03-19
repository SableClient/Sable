// Based on https://github.com/mohamad-fallah/react-voice-recorder-kit by mohamad-fallah
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  UseVoiceRecorderOptions,
  UseVoiceRecorderReturn,
  RecorderState,
  VoiceRecorderStopPayload,
} from './types';
import { getSupportedAudioCodec, getSupportedAudioExtension } from './supportedCodec';

const BAR_COUNT = 40;
const WAVEFORM_POINT_COUNT = 100;

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

// downsample an array of samples to a target count by averaging blocks of samples together
function downsampleWaveform(samples: number[], targetCount: number): number[] {
  if (samples.length === 0) return Array.from({ length: targetCount }, () => 0.15);
  if (samples.length <= targetCount) {
    const step = (samples.length - 1) / (targetCount - 1);
    return Array.from({ length: targetCount }, (_, i) => {
      const position = i * step;
      const lower = Math.floor(position);
      const upper = Math.min(Math.ceil(position), samples.length - 1);
      const fraction = position - lower;
      if (lower === upper) {
        return samples[lower] ?? 0.15;
      }
      return (samples[lower] ?? 0.15) * (1 - fraction) + (samples[upper] ?? 0.15) * fraction;
    });
  }
  const step = samples.length / targetCount;
  return Array.from({ length: targetCount }, (_, i) => {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    const slice = samples.slice(start, end);
    return slice.length > 0 ? Math.max(...slice) : 0.15;
  });
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}): UseVoiceRecorderReturn {
  const { autoStart = true, onStop, onDelete } = options;

  /**
   * The audio codec we will use
   * we will choose depending on the browser support
   */
  const audioCodec = getSupportedAudioCodec();

  const [isRecording, setIsRecording] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [isTemporaryStopped, setIsTemporaryStopped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: BAR_COUNT }, () => 0.15)
  );
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [waveform, setWaveform] = useState<number[] | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedTimeRef = useRef<number>(0);
  const secondsRef = useRef(0);
  const lastUrlRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousChunksRef = useRef<Blob[]>([]);
  const isResumingRef = useRef(false);
  const isRestartingRef = useRef(false);
  const isTemporaryStopRef = useRef(false);
  const temporaryPreviewUrlRef = useRef<string | null>(null);
  /**
   * waveform samples collected during recording, used to generate waveform on stop.
   * We collect all samples and downsample at the end to get a more accurate waveform, especially for short recordings.
   * We use a ref to avoid causing re-renders on every sample.
   */
  const waveformSamplesRef = useRef<number[]>([]);
  /**
   * Flag to indicate whether we should be collecting waveform samples.
   * We need this because there can be a short delay between starting recording
   * and the audio graph being set up, during which we might get some samples that we don't want to include in the waveform.
   */
  const isCollectingWaveformRef = useRef(false);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const cleanupAudioContext = useCallback(() => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    frameCountRef.current = 0;
    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.suspend().catch(() => {});
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    dataArrayRef.current = null;
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecordingTimer = useCallback(() => {
    startTimeRef.current = Date.now() - pausedTimeRef.current * 1000;
    stopTimer();
    timerRef.current = window.setInterval(() => {
      if (startTimeRef.current === null) return;
      const diffMs = Date.now() - startTimeRef.current;
      setSeconds(Math.floor(diffMs / 1000));
    }, 1000);
  }, [stopTimer]);

  const startPlaybackTimer = useCallback(
    (audio: HTMLAudioElement) => {
      setSeconds(0);
      stopTimer();
      timerRef.current = window.setInterval(() => {
        setSeconds(Math.floor(audio.currentTime));
      }, 250);
    },
    [stopTimer]
  );

  useEffect(() => {
    // Keep a ref copy of seconds for use in callbacks to avoid stale closures
    secondsRef.current = seconds;
  }, [seconds]);

  const getAudioLength = useCallback(() => {
    if (startTimeRef.current === null) {
      return secondsRef.current;
    }
    const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
    return Math.max(secondsRef.current, elapsedSeconds);
  }, []);

  const emitStopPayload = useCallback(
    (file: File, url: string, waveformData: number[], audioLength: number) => {
      if (!onStop) return;
      const payload: VoiceRecorderStopPayload = {
        audioFile: file,
        audioUrl: url,
        waveform: waveformData,
        audioLength,
        audioCodec: file.type,
      };
      onStop(payload);
    },
    [onStop]
  );

  const animateLevels = useCallback(() => {
    const analyser = analyserRef.current;
    const storedArray = dataArrayRef.current;
    if (!analyser || !storedArray) return;

    const dataArray = new Uint8Array(storedArray);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      const bufferLength = dataArray.length;
      let sum = 0;
      for (let i = 0; i < bufferLength; i += 1) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;
      let normalized = (avg / 255) * 3.5;
      const minLevel = 0.05;
      if (normalized < minLevel) normalized = minLevel;
      if (normalized > 1) normalized = 1;

      frameCountRef.current += 1;
      if (frameCountRef.current >= 5) {
        setLevels((prev: number[]) => {
          const next: number[] = prev.slice(1);
          next.push(normalized);
          return next;
        });
        if (isCollectingWaveformRef.current) {
          waveformSamplesRef.current.push(normalized);
        }
        frameCountRef.current = 0;
      }

      animationFrameIdRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const setupAudioGraph = useCallback(
    (stream: MediaStream): MediaStream => {
      const audioContext = getSharedAudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;

      // Fix for iOS Safari: routing the stream through a MediaStreamDestination
      // prevents the AudioContext from "stealing" the track from the MediaRecorder
      const destination = audioContext.createMediaStreamDestination();
      source.connect(analyser);
      analyser.connect(destination);

      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      animateLevels();

      return destination.stream;
    },
    [animateLevels]
  );

  const setupPlaybackGraph = useCallback(
    (audio: HTMLAudioElement) => {
      const audioContext = getSharedAudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      animateLevels();
    },
    [animateLevels]
  );

  const internalStartRecording = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Browser does not support audio recording.');
      return;
    }

    setError(null);
    isResumingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const codec = getSupportedAudioCodec();
      if (!codec) {
        setError('No supported audio codec found for recording.');
        cleanupStream();
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      previousChunksRef.current = [];
      waveformSamplesRef.current = [];
      isCollectingWaveformRef.current = true;
      const recordedStream = setupAudioGraph(stream);
      startRecordingTimer();

      const mediaRecorder = new MediaRecorder(recordedStream, { mimeType: codec });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanupAudioContext();
        cleanupStream();
        stopTimer();
        setIsRecording(false);
        setIsPaused(false);
        const audioLength = getAudioLength();
        pausedTimeRef.current = 0;
        startTimeRef.current = null;

        isCollectingWaveformRef.current = false;

        if (isResumingRef.current) {
          isResumingRef.current = false;
          return;
        }

        if (isRestartingRef.current) {
          isRestartingRef.current = false;
          return;
        }

        if (chunksRef.current.length === 0) {
          if (isTemporaryStopRef.current) {
            setIsTemporaryStopped(true);
            setIsStopped(true);
            isTemporaryStopRef.current = false;
          } else {
            setIsStopped(true);
            setIsTemporaryStopped(false);
          }
          return;
        }

        const actualType = chunksRef.current[0]?.type || codec || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualType });
        if (lastUrlRef.current) {
          URL.revokeObjectURL(lastUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        lastUrlRef.current = url;
        setAudioUrl(url);

        const file = new File(
          [blob],
          `voice-${Date.now()}.${getSupportedAudioExtension(actualType)}`,
          {
            type: actualType,
          }
        );
        setAudioFile(file);

        const waveformData = downsampleWaveform(waveformSamplesRef.current, WAVEFORM_POINT_COUNT);
        setWaveform(waveformData);

        if (isTemporaryStopRef.current) {
          setIsTemporaryStopped(true);
          setIsStopped(true);
          isTemporaryStopRef.current = false;
        } else {
          setIsStopped(true);
          setIsTemporaryStopped(false);
          emitStopPayload(file, url, waveformData, audioLength);
        }
      };

      // Pass a timeslice to ensure Safari iOS periodically flushes chunks
      // Otherwise Safari might fail to emit any chunks when stopped abruptly
      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setIsStopped(false);
      pausedTimeRef.current = 0;
    } catch {
      setError('Microphone access denied or an error occurred.');
      cleanupAudioContext();
      cleanupStream();
      stopTimer();
      setIsRecording(false);
    }
  }, [
    cleanupAudioContext,
    cleanupStream,
    emitStopPayload,
    getAudioLength,
    setupAudioGraph,
    startRecordingTimer,
    stopTimer,
  ]);

  const start = useCallback(() => {
    internalStartRecording();
  }, [internalStartRecording]);

  const handlePause = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

    try {
      mediaRecorder.requestData();
      mediaRecorder.pause();
      stopTimer();
      pausedTimeRef.current = seconds;
      setIsPaused(true);

      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.suspend().catch(() => {});
      }

      setLevels(Array.from({ length: BAR_COUNT }, () => 0.15));
    } catch {
      setError('Error pausing recording');
    }
  }, [seconds, stopTimer]);

  const handleStopTemporary = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      previousChunksRef.current = [...chunksRef.current];
      isTemporaryStopRef.current = false;

      if (mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.requestData();
        } catch {
          // ignore
        }
      }

      try {
        mediaRecorder.stop();
      } catch {
        // ignore
      }

      // Let cleanupStream() be handled by mediaRecorder.onstop
      // Calling it synchronously here can kill the stream before Safari finishes emitting data
      setIsStopped(true);
      setIsTemporaryStopped(false);
      setIsPaused(false);
      pausedTimeRef.current = 0;
    } else {
      if (audioUrl && audioFile) {
        const waveformData =
          waveform ?? downsampleWaveform(waveformSamplesRef.current, WAVEFORM_POINT_COUNT);
        emitStopPayload(audioFile, audioUrl, waveformData, secondsRef.current);
      }
      cleanupAudioContext();
      cleanupStream();
      stopTimer();
      setIsRecording(false);
      setIsStopped(true);
      setIsTemporaryStopped(false);
      setIsPaused(false);
      pausedTimeRef.current = 0;
      startTimeRef.current = null;
    }
  }, [
    audioFile,
    audioUrl,
    cleanupAudioContext,
    cleanupStream,
    emitStopPayload,
    stopTimer,
    waveform,
  ]);

  const handleStop = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      previousChunksRef.current = [...chunksRef.current];
      isTemporaryStopRef.current = false;

      if (mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.requestData();
        } catch {
          // ignore
        }
      }

      try {
        mediaRecorder.stop();
      } catch {
        // ignore
      }

      // Let cleanupStream() be handled by mediaRecorder.onstop
      // Calling it synchronously here can kill the stream before Safari finishes emitting data
      setIsStopped(true);
      setIsTemporaryStopped(false);
      setIsPaused(false);
      pausedTimeRef.current = 0;
    } else {
      if (audioUrl && audioFile) {
        const waveformData =
          waveform ?? downsampleWaveform(waveformSamplesRef.current, WAVEFORM_POINT_COUNT);
        emitStopPayload(audioFile, audioUrl, waveformData, secondsRef.current);
      }
      cleanupAudioContext();
      cleanupStream();
      stopTimer();
      setIsRecording(false);
      setIsStopped(true);
      setIsTemporaryStopped(false);
      setIsPaused(false);
      pausedTimeRef.current = 0;
      startTimeRef.current = null;
    }
  }, [
    audioFile,
    audioUrl,
    cleanupAudioContext,
    cleanupStream,
    emitStopPayload,
    stopTimer,
    waveform,
  ]);

  const handlePreviewPlay = useCallback(() => {
    let urlToPlay = audioUrl;

    if (!urlToPlay && isPaused) {
      if (temporaryPreviewUrlRef.current) {
        URL.revokeObjectURL(temporaryPreviewUrlRef.current);
      }

      const allChunks =
        chunksRef.current.length > 0 ? chunksRef.current : previousChunksRef.current;

      if (allChunks.length > 0) {
        const actualType = allChunks[0]?.type || audioCodec || 'audio/webm';
        const blob = new Blob(allChunks, { type: actualType });
        urlToPlay = URL.createObjectURL(blob);
        temporaryPreviewUrlRef.current = urlToPlay;
      }
    }

    if (!urlToPlay) return;

    if (temporaryPreviewUrlRef.current && temporaryPreviewUrlRef.current !== urlToPlay) {
      URL.revokeObjectURL(temporaryPreviewUrlRef.current);
      temporaryPreviewUrlRef.current = null;
    }

    if (!audioRef.current || audioRef.current.src !== urlToPlay) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(urlToPlay);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        stopTimer();
        cleanupAudioContext();
        audio.currentTime = 0;
        setSeconds(pausedTimeRef.current); // Reset to total recorded time
      };
      audio.onpause = () => {
        setIsPlaying(false);
        stopTimer();
        cleanupAudioContext();
      };
      audio.onplay = () => {
        setIsPlaying(true);
        cleanupAudioContext();
        setupPlaybackGraph(audio);
        startPlaybackTimer(audio);
      };
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.01)) {
        audio.currentTime = 0;
        setSeconds(0);
      }
      audio.play().catch(() => {});
    }
  }, [
    audioUrl,
    isPaused,
    isPlaying,
    audioCodec,
    stopTimer,
    cleanupAudioContext,
    setupPlaybackGraph,
    startPlaybackTimer,
  ]);

  const handlePlay = useCallback(() => {
    if (!audioUrl) return;

    if (!audioRef.current) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        stopTimer();
        cleanupAudioContext();
        audio.currentTime = 0;
        setSeconds(0);
      };
      audio.onpause = () => {
        setIsPlaying(false);
        stopTimer();
        cleanupAudioContext();
      };
      audio.onplay = () => {
        setIsPlaying(true);
        cleanupAudioContext();
        setupPlaybackGraph(audio);
        startPlaybackTimer(audio);
      };
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.01)) {
        audio.currentTime = 0;
        setSeconds(0);
      }
      audio.play().catch(() => {});
    }
  }, [audioUrl, cleanupAudioContext, isPlaying, setupPlaybackGraph, startPlaybackTimer, stopTimer]);

  const handleResume = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Browser does not support audio recording.');
      return;
    }

    setError(null);
    isResumingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recordedStream = setupAudioGraph(stream);

      // Force update seconds to the correct total time before starting timer
      setSeconds(pausedTimeRef.current);
      startRecordingTimer();

      const codec = getSupportedAudioCodec() || audioCodec;
      const mediaRecorder = codec
        ? new MediaRecorder(recordedStream, { mimeType: codec })
        : new MediaRecorder(recordedStream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        cleanupAudioContext();
        cleanupStream();
        stopTimer();
        setIsRecording(false);
        setIsPaused(false);
        const audioLength = getAudioLength();
        pausedTimeRef.current = 0;
        startTimeRef.current = null;

        isCollectingWaveformRef.current = false;

        if (chunksRef.current.length === 0) {
          setIsStopped(true);
          return;
        }

        const actualType = chunksRef.current[0]?.type || audioCodec || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualType });
        if (lastUrlRef.current) {
          URL.revokeObjectURL(lastUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        lastUrlRef.current = url;
        setAudioUrl(url);

        const file = new File(
          [blob],
          `voice-${Date.now()}.${getSupportedAudioExtension(blob.type)}`,
          { type: blob.type }
        );
        setAudioFile(file);

        const waveformData = downsampleWaveform(waveformSamplesRef.current, WAVEFORM_POINT_COUNT);
        setWaveform(waveformData);

        emitStopPayload(file, url, waveformData, audioLength);
      };

      // Pass a timeslice to ensure Safari iOS periodically flushes chunks
      // Otherwise Safari might fail to emit any chunks when stopped abruptly
      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setIsStopped(false);
      setIsTemporaryStopped(false);
      setIsPlaying(false);

      isCollectingWaveformRef.current = true;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (temporaryPreviewUrlRef.current) {
        URL.revokeObjectURL(temporaryPreviewUrlRef.current);
        temporaryPreviewUrlRef.current = null;
      }

      // We removed: pausedTimeRef.current = seconds
      // So it keeps the correct total time from previous Pause
      startTimeRef.current = Date.now() - pausedTimeRef.current * 1000;
    } catch {
      setError('Microphone access denied or an error occurred.');
      cleanupAudioContext();
      cleanupStream();
      stopTimer();
      setIsRecording(false);
      isResumingRef.current = false;
    }
  }, [
    audioCodec,
    cleanupAudioContext,
    cleanupStream,
    emitStopPayload,
    getAudioLength,
    setupAudioGraph,
    startRecordingTimer,
    stopTimer,
  ]);

  const handleDelete = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    cleanupAudioContext();
    cleanupStream();
    stopTimer();
    setIsPlaying(false);
    setIsStopped(true);
    setIsRecording(false);
    setIsPaused(false);
    setSeconds(0);
    pausedTimeRef.current = 0;
    startTimeRef.current = null;
    setLevels(Array.from({ length: BAR_COUNT }, () => 0.15));
    previousChunksRef.current = [];
    chunksRef.current = [];
    waveformSamplesRef.current = [];
    isCollectingWaveformRef.current = false;
    setWaveform(null);

    if (temporaryPreviewUrlRef.current) {
      URL.revokeObjectURL(temporaryPreviewUrlRef.current);
      temporaryPreviewUrlRef.current = null;
    }

    if (onDelete) {
      onDelete();
    }
  }, [cleanupAudioContext, cleanupStream, onDelete, stopTimer]);

  const handleRestart = useCallback(() => {
    isRestartingRef.current = true;
    const mediaRecorder = mediaRecorderRef.current;

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    cleanupAudioContext();
    cleanupStream();
    stopTimer();
    setIsRecording(false);
    setIsStopped(false);
    setIsTemporaryStopped(false);
    setIsPaused(false);
    setIsPlaying(false);
    setSeconds(0);
    pausedTimeRef.current = 0;
    startTimeRef.current = null;
    setLevels(Array.from({ length: BAR_COUNT }, () => 0.15));
    previousChunksRef.current = [];
    chunksRef.current = [];
    isResumingRef.current = false;
    waveformSamplesRef.current = [];
    isCollectingWaveformRef.current = false;
    setWaveform(null);

    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }

    if (temporaryPreviewUrlRef.current) {
      URL.revokeObjectURL(temporaryPreviewUrlRef.current);
      temporaryPreviewUrlRef.current = null;
    }

    setAudioUrl(null);
    setAudioFile(null);
    internalStartRecording();
  }, [cleanupAudioContext, cleanupStream, internalStartRecording, stopTimer]);

  useEffect(() => {
    if (autoStart) {
      internalStartRecording();
    }
    return () => {
      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      cleanupAudioContext();
      cleanupStream();
      stopTimer();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = null;
      }
      if (temporaryPreviewUrlRef.current) {
        URL.revokeObjectURL(temporaryPreviewUrlRef.current);
        temporaryPreviewUrlRef.current = null;
      }
    };
  }, [autoStart, cleanupAudioContext, cleanupStream, internalStartRecording, stopTimer]);

  const getState = (): RecorderState => {
    if (isPlaying) return 'playing';
    if (isStopped && !isTemporaryStopped && audioUrl) return 'reviewing';
    if (isRecording && isPaused) return 'paused';
    if (isRecording) return 'recording';
    return 'idle';
  };

  const handleRecordAgain = useCallback(() => {
    handleRestart();
  }, [handleRestart]);

  return {
    state: getState(),
    isRecording,
    isStopped,
    isTemporaryStopped,
    isPlaying,
    isPaused,
    seconds,
    levels,
    error,
    audioUrl,
    audioFile,
    waveform,
    start,
    handlePause,
    handleStopTemporary,
    handleStop,
    handleResume,
    handlePreviewPlay,
    handlePlay,
    handleRestart,
    handleDelete,
    handleRecordAgain,
  };
}
