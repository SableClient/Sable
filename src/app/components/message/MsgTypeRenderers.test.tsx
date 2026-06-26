import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MAudio, MFile, MImage, MSticker, MVideo } from './MsgTypeRenderers';

vi.mock('$utils/platform', () => ({
  hasServiceWorker: () => false,
  hasControllingServiceWorker: () => false,
}));

vi.mock('$utils/fetch', () => ({
  fetch: globalThis.fetch,
}));

describe('incoming media renderers', () => {
  it('rejects arbitrary image URLs', () => {
    const renderImageContent = vi.fn(() => <img alt="rendered" />);

    render(
      <MImage
        content={{ body: 'remote image', url: 'https://attacker.example/image.png' } as any}
        renderImageContent={renderImageContent}
      />
    );

    expect(renderImageContent).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent('Broken message: remote image');
  });

  it('renders mxc image URLs', () => {
    const renderImageContent = vi.fn(() => <img alt="rendered" />);

    render(
      <MImage
        content={{ body: 'matrix image', url: 'mxc://example.org/image' } as any}
        renderImageContent={renderImageContent}
      />
    );

    expect(renderImageContent).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'mxc://example.org/image' })
    );
  });

  it('does not pass arbitrary video URLs to the video renderer', () => {
    const renderAsFile = vi.fn(() => <span>file fallback</span>);
    const renderVideoContent = vi.fn(() => <video />);

    render(
      <MVideo
        content={
          {
            body: 'remote video',
            url: 'https://attacker.example/video.mp4',
            info: { mimetype: 'video/mp4' },
          } as any
        }
        renderAsFile={renderAsFile}
        renderVideoContent={renderVideoContent}
      />
    );

    expect(renderVideoContent).not.toHaveBeenCalled();
    expect(renderAsFile).toHaveBeenCalledTimes(1);
  });

  it('does not pass arbitrary audio URLs to the audio renderer', () => {
    const renderAsFile = vi.fn(() => <span>file fallback</span>);
    const renderAudioContent = vi.fn(() => <audio />);

    render(
      <MAudio
        content={
          {
            body: 'remote audio',
            url: 'https://attacker.example/audio.mp3',
            info: { mimetype: 'audio/mpeg' },
          } as any
        }
        renderAsFile={renderAsFile}
        renderAudioContent={renderAudioContent}
      />
    );

    expect(renderAudioContent).not.toHaveBeenCalled();
    expect(renderAsFile).toHaveBeenCalledTimes(1);
  });

  it('rejects arbitrary file URLs', () => {
    const renderFileContent = vi.fn(() => <span>rendered file</span>);

    render(
      <MFile
        content={{ body: 'remote file', url: 'https://attacker.example/file.txt' } as any}
        renderFileContent={renderFileContent}
      />
    );

    expect(renderFileContent).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent('Broken message: remote file');
  });

  it('rejects arbitrary sticker URLs', () => {
    const renderImageContent = vi.fn(() => <img alt="rendered sticker" />);

    render(
      <MSticker
        content={{ body: 'remote sticker', url: 'https://attacker.example/sticker.png' } as any}
        renderImageContent={renderImageContent}
      />
    );

    expect(renderImageContent).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent('Broken message: remote sticker');
  });
});
