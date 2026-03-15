# react-voice-recorder-kit

A lightweight React library for voice recording with audio waveform visualization and no UI framework dependencies

* No UI framework dependencies (Pure React + Inline CSS)
* Animated audio waveform visualization (40 bars)
* Ready-to-use component
* Fully customizable hook
* TypeScript support
* Compatible with Next.js, Vite, CRA, and more

---

## Screenshots

### Initial State (Ready to Record)
<p align="center">
  <img src="assets/Screenshot%202025-12-05%20173340.png" alt="Initial State" width="600"/>
</p>

### Recording in Progress
![Recording](assets/Screenshot%202025-12-05%20173347.png)

### Paused State
![Paused](assets/Screenshot%202025-12-05%20173407.png)

### Recorded Audio Ready to Play (Custom Styled)
![Completed Recording Custom](assets/Screenshot%202025-12-05%20173519.png)

---

## Installation

```bash
npm install react-voice-recorder-kit
# or
pnpm add react-voice-recorder-kit
# or
yarn add react-voice-recorder-kit
```

Requires **React 18+**

---

## Quick Start (Using Component)

```tsx
'use client'

import { useState } from 'react'
import { VoiceRecorder } from 'react-voice-recorder-kit'

export default function Page() {
  const [file, setFile] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<number[]>([])
  const [audioLength, setAudioLength] = useState(0)

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <h1>React Voice Recorder Kit</h1>

      <VoiceRecorder
        autoStart={false}
        onStop={({ audioFile, audioUrl, waveform, audioLength }) => {
          setFile(audioFile)
          setUrl(audioUrl)
          setWaveform(waveform)
          setAudioLength(audioLength)
        }}
        onDelete={() => {
          setFile(null)
          setUrl(null)
          setWaveform([])
          setAudioLength(0)
        }}
      />

      {url && (
        <div style={{ marginTop: 16 }}>
          <audio controls src={url} style={{ width: '100%' }} />
          {file instanceof File && (
            <p style={{ fontSize: 12, marginTop: 8 }}>
              File name: {file.name} | Size: {file.size} bytes
            </p>
          )}
          <p style={{ fontSize: 12, marginTop: 8 }}>
            Length: {audioLength}s | Waveform points: {waveform.length}
          </p>
        </div>
      )}
    </div>
  )
}
```

---

## Usage in Next.js (App Router)

```tsx
'use client'

import { VoiceRecorder } from 'react-voice-recorder-kit'

export default function VoicePage() {
  return (
    <div style={{ padding: 24 }}>
      <VoiceRecorder autoStart={true} />
    </div>
  )
}
```

---

## Component API

### Main Props

| Prop      | Type                              | Default   | Description                                    |
| --------- | --------------------------------- | --------- | ---------------------------------------------- |
| autoStart | boolean                           | true      | Auto-start recording on mount                  |
| onStop    | (payload: { audioFile: Blob; audioUrl: string; waveform: number[]; audioLength: number }) => void | undefined | Callback after recording stops (all values batched) |
| onDelete  | () => void                        | undefined | Callback after recording is deleted           |
| width     | string \| number                  | '100%'    | Component width                                |
| height    | string \| number                  | undefined | Component height                               |
| style     | CSSProperties                    | undefined | Additional styles for container                |

### Styling Props

| Prop                        | Type                                    | Default                                                      | Description                          |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| backgroundColor             | string                                  | '#ffffff'                                                    | Background color                     |
| borderColor                 | string                                  | '#e5e7eb'                                                    | Border color                         |
| borderRadius                | string \| number                        | 4                                                            | Border radius                        |
| padding                     | string \| number                        | '6px 10px'                                                   | Internal padding                     |
| gap                         | string \| number                        | 8                                                            | Gap between elements                 |
| recordingIndicatorColor     | string                                  | '#ef4444'                                                    | Recording indicator color            |
| idleIndicatorColor          | string                                  | '#9ca3af'                                                    | Idle indicator color                 |
| timeTextColor               | string                                  | undefined                                                    | Time text color                      |
| timeFontSize                | string \| number                        | 12                                                           | Time font size                       |
| timeFontWeight              | string \| number                        | 500                                                          | Time font weight                     |
| timeFontFamily              | string                                  | 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' | Time font family                     |
| visualizerBarColor          | string \| (level: number, index: number) => string | '#4b5563'                              | Waveform bar color                   |
| visualizerBarWidth          | number                                  | 3                                                            | Waveform bar width                   |
| visualizerBarGap            | number                                  | 4                                                            | Gap between bars                     |
| visualizerBarHeight         | number                                  | 40                                                           | Waveform bar height                  |
| visualizerHeight            | number                                  | 40                                                           | Total waveform height                |
| buttonSize                  | number                                  | 28                                                           | Button size                          |
| buttonBackgroundColor       | string                                  | '#ffffff'                                                    | Button background color              |
| buttonBorderColor           | string                                  | '#e5e7eb'                                                    | Button border color                  |
| buttonBorderRadius          | string \| number                        | 999                                                          | Button border radius                 |
| buttonHoverBackgroundColor  | string                                  | undefined                                                    | Button hover background color        |
| buttonGap                   | number                                  | 4                                                            | Gap between buttons                  |
| errorTextColor              | string                                  | '#dc2626'                                                    | Error text color                     |
| errorFontSize               | string \| number                        | 10                                                           | Error font size                      |
| errorFontFamily             | string                                  | 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' | Error font family                    |
| iconSize                    | number                                  | 18                                                           | Icon size                            |
| iconColor                   | string                                  | undefined                                                    | Icon color                           |

### Custom Icon Props

| Prop            | Type      | Default   | Description              |
| --------------- | --------- | --------- | ------------------------ |
| customPlayIcon  | ReactNode | undefined | Custom play icon         |
| customPauseIcon | ReactNode | undefined | Custom pause icon        |
| customStopIcon  | ReactNode | undefined | Custom stop icon         |
| customResumeIcon| ReactNode | undefined | Custom resume icon       |
| customDeleteIcon| ReactNode | undefined | Custom delete icon       |
| customRepeatIcon| ReactNode | undefined | Custom repeat icon       |

---

## Component Usage Examples

### Example 1: Simple Usage

```tsx
import { VoiceRecorder } from 'react-voice-recorder-kit'

function SimpleRecorder() {
  return <VoiceRecorder />
}
```

### Example 2: Custom Styling

```tsx
import { VoiceRecorder } from 'react-voice-recorder-kit'

function CustomStyledRecorder() {
  return (
    <VoiceRecorder
      backgroundColor="#f3f4f6"
      borderColor="#d1d5db"
      borderRadius={12}
      recordingIndicatorColor="#10b981"
      visualizerBarColor="#6366f1"
      buttonBackgroundColor="#ffffff"
      buttonHoverBackgroundColor="#f9fafb"
    />
  )
}
```

### Example 3: Using with Callbacks

```tsx
import { useState } from 'react'
import { VoiceRecorder } from 'react-voice-recorder-kit'

function RecorderWithCallbacks() {
  const [audioFile, setAudioFile] = useState<Blob | null>(null)

  return (
    <VoiceRecorder
      autoStart={false}
      onStop={({ audioFile, waveform, audioLength }) => {
        if (audioFile instanceof File) {
          console.log('Recording stopped:', audioFile.name)
        }
        console.log('Audio length (s):', audioLength)
        console.log('Waveform points:', waveform.length)
        setAudioFile(audioFile)
      }}
      onDelete={() => {
        console.log('Recording deleted')
        setAudioFile(null)
      }}
    />
  )
}
```

### Example 4: Dynamic Color Waveform

```tsx
import { VoiceRecorder } from 'react-voice-recorder-kit'

function DynamicColorRecorder() {
  return (
    <VoiceRecorder
      visualizerBarColor={(level, index) => {
        const hue = (level * 120).toString()
        return `hsl(${hue}, 70%, 50%)`
      }}
    />
  )
}
```

---

## Using the Hook (useVoiceRecorder)

For full control over the UI, you can use the hook directly.

### Import

```ts
import { useVoiceRecorder } from 'react-voice-recorder-kit'
```

### Options

```ts
type UseVoiceRecorderOptions = {
  autoStart?: boolean
  onStop?: (payload: { audioFile: Blob; audioUrl: string; waveform: number[]; audioLength: number }) => void
  onDelete?: () => void
}
```

### Return Values

```ts
type UseVoiceRecorderReturn = {
  state: RecorderState
  isRecording: boolean
  isStopped: boolean
  isTemporaryStopped: boolean
  isPlaying: boolean
  isPaused: boolean
  seconds: number
  levels: number[]
  error: string | null
  audioUrl: string | null
  audioFile: File | null
  waveform: number[] | null
  start: () => void
  handlePause: () => void
  handleStopTemporary: () => void
  handleStop: () => void
  handleResume: () => void
  handlePreviewPlay: () => void
  handlePlay: () => void
  handleRestart: () => void
  handleDelete: () => void
  handleRecordAgain: () => void
}
```

| Property          | Type           | Description                                    |
| ----------------- | -------------- | ---------------------------------------------- |
| state             | RecorderState  | Current state: 'idle' \| 'recording' \| 'paused' \| 'reviewing' \| 'playing' |
| isRecording       | boolean        | Is currently recording                         |
| isStopped         | boolean        | Is recording stopped                           |
| isTemporaryStopped| boolean        | Is recording temporarily stopped                |
| isPlaying         | boolean        | Is currently playing                           |
| isPaused          | boolean        | Is recording paused                            |
| seconds           | number         | Time in seconds                                |
| levels            | number[]       | Array of 40 audio levels (0 to 1)              |
| error             | string \| null | Error message if any                           |
| audioUrl          | string \| null | URL of recorded audio file                     |
| audioFile         | File \| null   | Recorded audio file                            |
| waveform          | number[] \| null | Downsampled waveform points for the recording |
| start             | () => void     | Start recording                                |
| handlePause       | () => void     | Pause recording                                |
| handleStopTemporary| () => void    | Temporary stop and review                      |
| handleStop        | () => void     | Stop and save recording                        |
| handleResume      | () => void     | Resume recording after pause                   |
| handlePreviewPlay | () => void     | Play preview (in paused state)                 |
| handlePlay        | () => void     | Play recorded file                             |
| handleRestart     | () => void     | Restart recording                              |
| handleDelete      | () => void     | Delete recording and return to initial state   |
| handleRecordAgain | () => void     | Record again (same as handleRestart)           |

---

## Complete Hook Usage Example

```tsx
'use client'

import { useVoiceRecorder } from 'react-voice-recorder-kit'

export default function CustomRecorder() {
  const {
    state,
    isRecording,
    isPaused,
    isStopped,
    isPlaying,
    seconds,
    levels,
    audioUrl,
    audioFile,
    error,
    start,
    handlePause,
    handleResume,
    handleStop,
    handlePlay,
    handleDelete,
    handleRestart
  } = useVoiceRecorder({ autoStart: false })

  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60)
    const sec = secs % 60
    return `${minutes}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ padding: 16, maxWidth: 600 }}>
      <h2>Custom Voice Recorder</h2>

      <div style={{ marginBottom: 8 }}>
        Status: {state} | Time: {formatTime(seconds)}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!isRecording && !isStopped && (
          <button onClick={start}>Start</button>
        )}

        {isRecording && !isPaused && (
          <>
            <button onClick={handlePause}>Pause</button>
            <button onClick={handleStop}>Stop & Save</button>
            <button onClick={handleRestart}>Restart</button>
          </>
        )}

        {isPaused && (
          <>
            <button onClick={handleResume}>Resume</button>
            <button onClick={handleRestart}>Restart</button>
            <button onClick={handleStop}>Stop & Save</button>
          </>
        )}

        {isStopped && audioUrl && (
          <>
            <button onClick={handlePlay}>
              {isPlaying ? 'Stop Playback' : 'Play'}
            </button>
            <button onClick={handleDelete}>Delete</button>
            <button onClick={handleRestart}>Record Again</button>
          </>
        )}
      </div>

      {error && (
        <div style={{ color: 'red', marginTop: 8 }}>
          {error}
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          height: 40,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 4,
          overflow: 'hidden'
        }}
      >
        {levels.map((level, index) => {
          const height = 5 + level * 35
          return (
            <div
              key={index}
              style={{
                width: 4,
                height,
                borderRadius: 4,
                background: '#444'
              }}
            />
          )
        })}
      </div>

      {audioUrl && (
        <div style={{ marginTop: 16 }}>
          <audio controls src={audioUrl} style={{ width: '100%' }} />
        </div>
      )}
    </div>
  )
}
```

---

## Recording States (RecorderState)

The component and hook have 5 different states:

- **idle**: Initial state, ready to start
- **recording**: Currently recording
- **paused**: Recording paused (can be resumed)
- **reviewing**: Recording completed and under review
- **playing**: Playing recorded file

---

## Features

* Voice recording using MediaRecorder API
* Animated audio waveform visualization during recording and playback
* Support for pause and resume
* Support for playing recorded files
* Time display in MM:SS format
* Error handling and error message display
* Ready-to-use UI with control buttons
* Fully customizable styling and sizing
* No external dependencies
* Support for custom icons
* Dynamic color waveforms

---

## Important Notes

1. Requires microphone access in the browser
2. Recorded files are saved in WebM format
3. In paused state, you can play a preview of the recording
4. You can dynamically set bar colors using `visualizerBarColor`
5. All created URLs are automatically cleaned up

---

## License

MIT

(orignal by Mohammadreza Fallahfaal: https://github.com/mohamad-fallah/react-voice-recorder-kit)
