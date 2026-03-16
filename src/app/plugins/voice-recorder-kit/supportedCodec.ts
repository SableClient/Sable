const safariPreferredCodecs = [
  // Safari works best with MP4/AAC but fails when strict codecs are defined on iOS.
  // Prioritize the plain container to avoid NotSupportedError during MediaRecorder initialization.
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4;codecs=mp4a.40.5',
  'audio/mp4;codecs=aac',
  'audio/aac',
  // Fallbacks
  'audio/wav;codecs=1',
  'audio/wav',
  'audio/mpeg',
];

const defaultPreferredCodecs = [
  // Chromium / Firefox stable path.
  'audio/webm;codecs=opus',
  'audio/webm',
  // Firefox
  'audio/ogg;codecs=opus',
  'audio/ogg;codecs=vorbis',
  'audio/ogg',
  // Fallbacks
  'audio/wav;codecs=1',
  'audio/wav',
  'audio/mpeg',
  // Keep MP4/AAC as late fallback for non-Safari browsers.
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4;codecs=mp4a.40.5',
  'audio/mp4;codecs=aac',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=speex',
  'audio/webm;codecs=vorbis',
];

/**
 * Checks for supported audio codecs in the current browser and returns the first supported codec.
 * If no supported codec is found, it returns null.
 */
export function getSupportedAudioCodec(): string | null {
  if (!('MediaRecorder' in globalThis) || !globalThis.MediaRecorder) {
    return null;
  }

  const userAgent = globalThis.navigator?.userAgent ?? '';
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    (globalThis.navigator?.platform === 'MacIntel' && globalThis.navigator?.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(userAgent) || isIOS;

  const preferredCodecs = isSafari ? safariPreferredCodecs : defaultPreferredCodecs;
  const supportedCodec = preferredCodecs.find((codec) => MediaRecorder.isTypeSupported(codec));
  return supportedCodec || null;
}

/**
 * Returns the appropriate file extension for a given audio codec.
 * This is used to ensure that the recorded audio file has the correct extension based on the codec used for recording.
 */
export function getSupportedAudioExtension(codec: string): string {
  const baseType = codec.split(';')[0].trim();
  switch (baseType) {
    case 'audio/ogg':
      return 'ogg';
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
      return 'wav';
    case 'audio/aac':
      return 'aac';
    default:
      return 'dat'; // default extension for unknown codecs
  }
}
