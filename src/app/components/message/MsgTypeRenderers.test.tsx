import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  IAudioContent,
  IFileContent,
  IImageContent,
  IVideoContent,
} from '$types/matrix/common';
import { MAudio, MFile, MImage, MSticker, MVideo } from './MsgTypeRenderers';

describe('incoming image renderer', () => {
  it('rejects arbitrary HTTP(S) image URLs', () => {
    const renderImageContent = vi.fn<(props: unknown) => ReactNode>(() => <img alt="rendered" />);

    render(
      <MImage
        content={
          { body: 'remote image', url: 'https://attacker.example/image.png' } as IImageContent
        }
        renderImageContent={renderImageContent}
      />
    );

    expect(renderImageContent).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent('Broken message: remote image');
  });

  it('renders only mxc image URLs', () => {
    const renderImageContent = vi.fn<(props: unknown) => ReactNode>(() => <img alt="rendered" />);

    render(
      <MImage
        content={{ body: 'matrix image', url: 'mxc://example.org/image' } as IImageContent}
        renderImageContent={renderImageContent}
      />
    );

    expect(renderImageContent).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'mxc://example.org/image' })
    );
  });

  it('rejects an arbitrary encrypted-file URL even when the legacy URL is MXC', () => {
    const renderImageContent = vi.fn<(props: unknown) => ReactNode>(() => <img alt="rendered" />);

    render(
      <MImage
        content={
          {
            body: 'remote image',
            url: 'mxc://example.org/image',
            file: { url: 'https://attacker.example/image.png' },
          } as unknown as IImageContent
        }
        renderImageContent={renderImageContent}
      />
    );

    expect(renderImageContent).not.toHaveBeenCalled();
  });

  it('rejects arbitrary video URLs without invoking a renderer or fallback', () => {
    const renderAsFile = vi.fn<() => ReactNode>(() => <span>file fallback</span>);
    const renderVideoContent = vi.fn<(props: unknown) => ReactNode>(() => <span>video</span>);

    render(
      <MVideo
        content={
          {
            body: 'remote video',
            url: 'https://attacker.example/video.mp4',
            info: { mimetype: 'video/mp4' },
          } as IVideoContent
        }
        renderAsFile={renderAsFile}
        renderVideoContent={renderVideoContent}
      />
    );

    expect(renderVideoContent).not.toHaveBeenCalled();
    expect(renderAsFile).not.toHaveBeenCalled();
  });

  it('rejects arbitrary audio URLs without invoking a renderer or fallback', () => {
    const renderAsFile = vi.fn<() => ReactNode>(() => <span>file fallback</span>);
    const renderAudioContent = vi.fn<(props: unknown) => ReactNode>(() => <span>audio</span>);

    render(
      <MAudio
        content={
          {
            body: 'remote audio',
            url: 'https://attacker.example/audio.mp3',
            info: { mimetype: 'audio/mpeg' },
          } as IAudioContent
        }
        renderAsFile={renderAsFile}
        renderAudioContent={renderAudioContent}
      />
    );

    expect(renderAudioContent).not.toHaveBeenCalled();
    expect(renderAsFile).not.toHaveBeenCalled();
  });

  it('rejects arbitrary file URLs', () => {
    const renderFileContent = vi.fn<(props: unknown) => ReactNode>(() => (
      <span>rendered file</span>
    ));

    render(
      <MFile
        content={{ body: 'remote file', url: 'https://attacker.example/file.txt' } as IFileContent}
        renderFileContent={renderFileContent}
      />
    );

    expect(renderFileContent).not.toHaveBeenCalled();
  });

  it('rejects arbitrary sticker URLs', () => {
    const renderImageContent = vi.fn<(props: unknown) => ReactNode>(() => (
      <img alt="rendered sticker" />
    ));

    render(
      <MSticker
        content={
          { body: 'remote sticker', url: 'https://attacker.example/sticker.png' } as IImageContent
        }
        renderImageContent={renderImageContent}
      />
    );

    expect(renderImageContent).not.toHaveBeenCalled();
  });
});
