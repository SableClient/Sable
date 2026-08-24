import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { Image, processAndSanitizeLottie } from './Image';
import { Blob as NodeBlob } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { DecompressionStream as NodeDecompressionStream } from 'node:stream/web';

vi.stubGlobal('Blob', NodeBlob);
vi.stubGlobal('DecompressionStream', NodeDecompressionStream);
vi.stubGlobal(
  'IntersectionObserver',
  class {
    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }

    unobserve() {}
    disconnect() {}
  }
);

// file from https://github.com/LottieFiles/test-files/blob/main/data/shapes/rectangle.json
const lottieJson =
  '{"v":"5.11.0","fr":60,"ip":0,"op":120,"w":100,"h":50,"nm":"Comp 1","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Shape Layer 1","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[0,0,0],"ix":2,"l":2},"a":{"a":0,"k":[0,0,0],"ix":1,"l":2},"s":{"a":0,"k":[100,100,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ty":"rc","d":1,"s":{"a":0,"k":[80,30],"ix":2},"p":{"a":0,"k":[50,25],"ix":3},"r":{"a":0,"k":0,"ix":4},"nm":"Rectangle Path 1","mn":"ADBE Vector Shape - Rect","hd":false},{"ty":"fl","c":{"a":0,"k":[0.196077997544,0.313725998822,0.690195958755,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":0,"k":[0,0],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Ellipse 1","np":3,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":120,"st":0,"ct":1,"bm":0}],"markers":[],"props":{}}';

describe('Image', () => {
  it('removes executable-looking fields from Lottie JSON', () => {
    const processed = processAndSanitizeLottie({
      v: '5.11.0',
      x: 'this should not run',
      expression: 'alert(1)',
      layers: [{ script: 'alert(2)', x: 'wiggle()' }],
    });
    expect(processed ? JSON.parse(processed) : null).toEqual({ v: '5.11.0', layers: [{}] });
  });

  it('renders a regular img without probing its source', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let loadTarget: EventTarget | null = null;
    const onLoad = vi.fn<(event: React.SyntheticEvent<HTMLImageElement>) => void>((event) => {
      loadTarget = event.currentTarget;
    });
    render(<Image src="https://example.com/demo.png" alt="demo" onLoad={onLoad} />);

    const image = screen.getByAltText('demo');
    expect(image.tagName).toBe('IMG');
    expect(image).toHaveAttribute('src', 'https://example.com/demo.png');
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.load(image);
    expect(onLoad).toHaveBeenCalledOnce();
    expect(loadTarget).toBe(image);

    fetchSpy.mockRestore();
  });

  it('uses the lottie renderer for gzipped lottie data', async () => {
    const gzipped = Buffer.from(gzipSync(lottieJson)).toString('base64');
    render(
      <Image
        src={`data:application/gzip;base64,${gzipped}`}
        width={321}
        height={123}
        aria-label="demo"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('demo').tagName).toBe('CANVAS');
    });
    const rendered = screen.getByLabelText('demo');
    expect(rendered).toBeInTheDocument();
    expect(rendered).toHaveAttribute('width', '321');
    expect(rendered).toHaveAttribute('height', '123');
  });

  it('keeps lottie emoticons at inline-emoticon size', async () => {
    const gzipped = Buffer.from(gzipSync(lottieJson)).toString('base64');
    render(
      <Image
        src={`data:application/gzip;base64,${gzipped}`}
        aria-label="emoticon"
        data-mx-emoticon
        style={{ width: 'auto', height: '1em' }}
      />
    );

    await waitFor(() => expect(screen.getByLabelText('emoticon').tagName).toBe('CANVAS'));
    const canvas = screen.getByLabelText('emoticon');
    expect(canvas.parentElement).toHaveStyle({ width: '16px', height: '16px' });
  });

  it('forwards the canvas ref and pointer events for lottie images', async () => {
    const gzipped = Buffer.from(gzipSync(lottieJson)).toString('base64');
    const ref = createRef<HTMLImageElement | HTMLCanvasElement>();
    const onPointerDown = vi.fn<(event: React.PointerEvent<HTMLElement>) => void>();
    render(
      <Image
        ref={ref}
        src={`data:application/gzip;base64,${gzipped}`}
        aria-label="interactive lottie"
        onPointerDown={onPointerDown}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('interactive lottie').tagName).toBe('CANVAS');
    });
    const canvas = screen.getByLabelText('interactive lottie');
    fireEvent.pointerDown(canvas);

    expect(canvas.tagName).toBe('CANVAS');
    await waitFor(() => expect(ref.current).toBe(canvas));
    expect(onPointerDown).toHaveBeenCalledOnce();
  });

  it('probes an undeclared lottie only after native image decoding fails', async () => {
    const bytes = Uint8Array.from(gzipSync(lottieJson));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(bytes, { headers: { 'content-length': `${bytes.length}` } }));
    render(<Image src="https://example.com/extensionless-media" alt="undeclared lottie" />);

    const image = screen.getByAltText('undeclared lottie');
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.error(image);

    await waitFor(() => {
      expect(screen.getByLabelText('undeclared lottie').tagName).toBe('CANVAS');
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it('forwards one error for an undeclared broken non-lottie image', async () => {
    const onError = vi.fn<(event: React.SyntheticEvent<HTMLImageElement>) => void>();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('not a gzip file'));
    render(
      <Image
        src="https://example.com/undeclared-broken-media"
        alt="undeclared broken image"
        onError={onError}
      />
    );

    const image = screen.getByAltText('undeclared broken image');
    fireEvent.error(image);
    expect(image).not.toHaveAttribute('src');
    expect(onError).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(image).toHaveAttribute('src', 'https://example.com/undeclared-broken-media')
    );
    fireEvent.error(image);

    expect(onError).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it('shares lottie resolution work for repeated media', async () => {
    const bytes = Uint8Array.from(gzipSync(lottieJson));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(bytes, { headers: { 'content-length': `${bytes.length}` } }));
    render(
      <>
        <Image src="https://example.com/repeated-sticker.tgs" aria-label="repeated lottie" />
        <Image src="https://example.com/repeated-sticker.tgs" aria-label="repeated lottie" />
      </>
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText('repeated lottie')).toHaveLength(2);
      expect(
        screen.getAllByLabelText('repeated lottie').every((item) => item.tagName === 'CANVAS')
      ).toBe(true);
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it('retries lottie resolution after a transient failure', async () => {
    const bytes = Uint8Array.from(gzipSync(lottieJson));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('temporary failure'))
      .mockResolvedValueOnce(
        new Response(bytes, { headers: { 'content-length': `${bytes.length}` } })
      );
    const source = 'https://example.com/transient-sticker.tgs';
    const firstRender = render(<Image src={source} aria-label="transient lottie" />);

    await waitFor(() => expect(screen.getByLabelText('transient lottie')).toHaveAttribute('src'));
    expect(screen.getByLabelText('transient lottie').tagName).toBe('IMG');
    firstRender.unmount();

    render(<Image src={source} aria-label="transient lottie" />);
    await waitFor(() => {
      expect(screen.getByLabelText('transient lottie').tagName).toBe('CANVAS');
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('bounds in-flight lottie downloads with a timeout signal', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const { unmount } = render(
      <Image src="https://example.com/sticker.tgs" alt="loading lottie" />
    );

    await waitFor(() => expect(requestSignal).toBeDefined());
    expect(requestSignal?.aborted).toBe(false);
    unmount();

    fetchSpy.mockRestore();
  });

  it('rejects lottie data that exceeds the decompressed size limit', async () => {
    const oversizedJson = JSON.stringify({
      v: '5.11.0',
      padding: 'a'.repeat(8 * 1024 * 1024),
    });
    const gzipped = Buffer.from(gzipSync(oversizedJson)).toString('base64');
    render(
      <Image
        src={`data:application/gzip;base64,${gzipped}`}
        alt="oversized lottie"
        onError={() => {}}
      />
    );

    const image = screen.getByAltText('oversized lottie');
    await waitFor(() => expect(image).toHaveAttribute('src'));
    expect(image.tagName).toBe('IMG');
  });

  it('forwards a candidate fallback error after detection fails', async () => {
    let errorTarget: EventTarget | null = null;
    const onError = vi.fn<(event: React.SyntheticEvent<HTMLImageElement>) => void>((event) => {
      errorTarget = event.currentTarget;
    });
    render(
      <Image src="data:application/gzip;base64,bm90LWd6aXBwZWQ=" alt="broken" onError={onError} />
    );

    const image = screen.getByAltText('broken');
    expect(image).not.toHaveAttribute('src');

    await waitFor(() => {
      expect(image).toHaveAttribute('src', 'data:application/gzip;base64,bm90LWd6aXBwZWQ=');
    });
    fireEvent.error(image);

    expect(onError).toHaveBeenCalledOnce();
    expect(errorTarget).toBe(image);
  });
});
