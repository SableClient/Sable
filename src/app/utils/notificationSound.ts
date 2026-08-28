// HTMLAudioElement.play() registers a media session (lock screen / media keys)
// and, in WKWebView, runs on the .playback audio session category, which uses
// media volume and interrupts whatever the user is listening to. A Web Audio
// buffer source does neither.

let context: AudioContext | undefined;
let playingSource: AudioBufferSourceNode | undefined;
const buffers = new Map<string, Promise<AudioBuffer>>();

const decode = (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
  const cached = buffers.get(url);
  if (cached) return cached;

  const buffer = fetch(url)
    .then((response) => response.arrayBuffer())
    .then((bytes) => ctx.decodeAudioData(bytes))
    .catch((error) => {
      buffers.delete(url);
      throw error;
    });
  buffers.set(url, buffer);
  return buffer;
};

export const playNotificationSound = async (url: string): Promise<void> => {
  context ??= new AudioContext();
  const buffer = await decode(context, url);
  // A context constructed outside a user gesture starts suspended, and Safari
  // moves it to 'interrupted' after a phone call or a route change.
  if (context.state !== 'running') await context.resume();
  if (playingSource) return;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  playingSource = source;
  source.addEventListener(
    'ended',
    () => {
      if (playingSource === source) playingSource = undefined;
    },
    { once: true }
  );
  source.start();
};
