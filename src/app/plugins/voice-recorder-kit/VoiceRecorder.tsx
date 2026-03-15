import type { CSSProperties } from 'react';
import { useMemo, useRef, useEffect, useState } from 'react';
import { useVoiceRecorder } from './useVoiceRecorder';
import type { VoiceRecorderProps } from './types';
import { PlayIcon, PauseIcon, StopIcon, RepeatIcon, DeleteIcon, ResumeIcon } from './icons';

function VoiceRecorder(props: VoiceRecorderProps) {
  const {
    width,
    height,
    style,
    backgroundColor = '#ffffff',
    borderColor = '#e5e7eb',
    borderRadius = 4,
    padding = '6px 10px',
    gap = 8,
    recordingIndicatorColor = '#ef4444',
    idleIndicatorColor = '#9ca3af',
    timeTextColor,
    timeFontSize = 12,
    timeFontWeight = 500,
    timeFontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    visualizerBarColor = '#4b5563',
    visualizerBarWidth = 3,
    visualizerBarGap = 4,
    visualizerBarHeight = 40,
    visualizerHeight = 40,
    buttonSize = 28,
    buttonBackgroundColor = '#ffffff',
    buttonBorderColor = '#e5e7eb',
    buttonBorderRadius = 999,
    buttonHoverBackgroundColor,
    buttonGap = 4,
    errorTextColor = '#dc2626',
    errorFontSize = 10,
    errorFontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    customPlayIcon,
    customPauseIcon,
    customStopIcon,
    customResumeIcon,
    customDeleteIcon,
    customRepeatIcon,
    iconSize = 18,
    iconColor,
    ...recorderOptions
  } = props;

  const {
    state,
    isRecording,
    isStopped,
    isPlaying,
    seconds,
    levels,
    error,
    handlePause,
    handleStopTemporary,
    handleStop,
    handleResume,
    handlePreviewPlay,
    handlePlay,
    handleRestart,
    handleDelete,
  } = useVoiceRecorder(recorderOptions);

  const containerRef = useRef<HTMLDivElement>(null);
  const [visualizerWidth, setVisualizerWidth] = useState(0);
  const visualizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (visualizerRef.current) {
        const availableWidth = visualizerRef.current.offsetWidth;
        setVisualizerWidth(Math.max(0, availableWidth));
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    if (visualizerRef.current) {
      resizeObserver.observe(visualizerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [width, isStopped, error]);

  const formattedTime = useMemo(() => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }, [seconds]);

  const barWidth = visualizerBarWidth;
  const barGap = visualizerBarGap;

  const maxBars = useMemo(() => {
    if (visualizerWidth <= 0) {
      return Math.max(levels.length, 40);
    }
    const calculatedBars = Math.floor(visualizerWidth / (barWidth + barGap));
    return Math.max(calculatedBars, 1);
  }, [visualizerWidth, levels.length, barWidth, barGap]);

  const displayedLevels = useMemo(() => {
    if (maxBars <= 0 || levels.length === 0) {
      return Array.from({ length: Math.max(maxBars, 40) }, () => 0.15);
    }

    if (maxBars <= levels.length) {
      const step = levels.length / maxBars;
      return Array.from({ length: maxBars }, (_, i) => {
        const start = Math.floor(i * step);
        const end = Math.floor((i + 1) * step);
        const slice = levels.slice(start, end);
        return slice.length > 0 ? Math.max(...slice) : 0.15;
      });
    }

    const step = (levels.length - 1) / (maxBars - 1);
    return Array.from({ length: maxBars }, (_, i) => {
      const position = i * step;
      const lowerIndex = Math.floor(position);
      const upperIndex = Math.min(Math.ceil(position), levels.length - 1);
      const fraction = position - lowerIndex;

      if (lowerIndex === upperIndex) {
        return levels[lowerIndex] || 0.15;
      }

      return (
        (levels[lowerIndex] || 0.15) * (1 - fraction) + (levels[upperIndex] || 0.15) * fraction
      );
    });
  }, [levels, maxBars]);

  const containerStyle: CSSProperties = useMemo(
    () => ({
      display: 'flex',
      alignItems: 'center',
      gap: typeof gap === 'number' ? `${gap}px` : gap,
      backgroundColor,
      borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
      border: `1px solid ${borderColor}`,
      padding: typeof padding === 'number' ? `${padding}px` : padding,
      width: width ?? '100%',
      height,
      boxSizing: 'border-box',
      ...style,
    }),
    [width, height, style, backgroundColor, borderColor, borderRadius, padding, gap]
  );

  return (
    <div ref={containerRef} style={containerStyle}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 9999,
          backgroundColor: isRecording ? recordingIndicatorColor : idleIndicatorColor,
        }}
      />
      <span
        style={{
          fontSize: typeof timeFontSize === 'number' ? `${timeFontSize}px` : timeFontSize,
          fontWeight: timeFontWeight,
          minWidth: 40,
          fontFamily: timeFontFamily,
          color: timeTextColor,
        }}
      >
        {formattedTime}
      </span>
      <div
        ref={visualizerRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: barGap,
          overflow: 'hidden',
          height: visualizerHeight,
          minWidth: 0,
          justifyContent: 'flex-start',
        }}
      >
        {displayedLevels.map((level) => (
          <span
            key={Math.random()}
            style={{
              width: barWidth,
              borderRadius: 999,
              backgroundColor:
                typeof visualizerBarColor === 'function'
                  ? visualizerBarColor(level, displayedLevels.indexOf(level))
                  : visualizerBarColor,
              height: 1 + Math.max(0.1, Math.min(level, 1)) * (visualizerBarHeight - 1),
              flexShrink: 0,
            }}
          />
        ))}
      </div>

      {state === 'recording' && (
        <div style={{ display: 'flex', gap: buttonGap, marginLeft: 8 }}>
          <button
            type="button"
            onClick={handlePause}
            title="Pause recording"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customPauseIcon || <PauseIcon size={iconSize} />}
          </button>
          <button
            type="button"
            onClick={handleStopTemporary}
            title="Stop & Review"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customStopIcon || <StopIcon size={iconSize} />}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            title="Restart recording"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customRepeatIcon || <RepeatIcon size={iconSize} />}
          </button>
        </div>
      )}

      {state === 'paused' && (
        <div style={{ display: 'flex', gap: buttonGap, marginLeft: 8 }}>
          <button
            type="button"
            onClick={handleResume}
            title="Resume recording"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customResumeIcon || <ResumeIcon size={iconSize} />}
          </button>
          <button
            type="button"
            onClick={handlePreviewPlay}
            title="Play preview"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {isPlaying
              ? customPauseIcon || <PauseIcon size={iconSize} />
              : customPlayIcon || <PlayIcon size={iconSize} />}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            title="Restart recording"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customRepeatIcon || <RepeatIcon size={iconSize} />}
          </button>
          <button
            type="button"
            onClick={handleStop}
            title="Stop & Save"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customStopIcon || <StopIcon size={iconSize} />}
          </button>
        </div>
      )}

      {state === 'reviewing' && (
        <div style={{ display: 'flex', gap: buttonGap, marginLeft: 8 }}>
          <button
            type="button"
            onClick={isPlaying ? handlePause : handlePlay}
            title={isPlaying ? 'Pause playback' : 'Play'}
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {isPlaying
              ? customPauseIcon || <PauseIcon size={iconSize} />
              : customPlayIcon || <PlayIcon size={iconSize} />}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            title="Delete recording"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customDeleteIcon || <DeleteIcon size={iconSize} />}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            title="Restart recording"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customRepeatIcon || <RepeatIcon size={iconSize} />}
          </button>
        </div>
      )}

      {state === 'playing' && (
        <div style={{ display: 'flex', gap: buttonGap, marginLeft: 8 }}>
          <button
            type="button"
            onClick={handlePause}
            title="Pause playback"
            style={{
              width: buttonSize,
              height: buttonSize,
              borderRadius:
                typeof buttonBorderRadius === 'number'
                  ? `${buttonBorderRadius}px`
                  : buttonBorderRadius,
              border: `1px solid ${buttonBorderColor}`,
              backgroundColor: buttonBackgroundColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: iconColor,
              transition: buttonHoverBackgroundColor ? 'background-color 0.2s' : undefined,
            }}
            onMouseEnter={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonHoverBackgroundColor;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonHoverBackgroundColor) {
                e.currentTarget.style.backgroundColor = buttonBackgroundColor;
              }
            }}
          >
            {customPauseIcon || <PauseIcon size={iconSize} />}
          </button>
        </div>
      )}

      {error && (
        <span
          style={{
            color: errorTextColor,
            fontSize: typeof errorFontSize === 'number' ? `${errorFontSize}px` : errorFontSize,
            marginLeft: 8,
            fontFamily: errorFontFamily,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}

export default VoiceRecorder;
