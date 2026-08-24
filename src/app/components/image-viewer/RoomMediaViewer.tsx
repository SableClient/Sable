import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Chip, Spinner, Text } from 'folds';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { useCreateObjectURL } from '$hooks/useObjectURL';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import type { IImageInfo } from '$types/matrix/common';
import {
  decryptFile,
  downloadEncryptedMedia,
  mxcUrlToHttp,
  rewriteAuthenticatedMediaUrl,
} from '$utils/matrix';
import { prepareLoopbackImageSource } from '$utils/mediaUrl';
import { FALLBACK_MIMETYPE } from '$utils/mimeTypes';
import { setMediaEncryption } from '$utils/tauriMediaEncryption';
import { isTauri } from '@tauri-apps/api/core';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { timeDayMonthYear, timeHourMinute, today, yesterday } from '$utils/time';
import { ImageViewer } from './ImageViewer';

export type RoomMediaItem = {
  eventId: string;
  body: string;
  filename?: string;
  url: string;
  info?: IImageInfo;
  mimeType?: string;
  encInfo?: EncryptedAttachmentInfo;
  sender?: string;
  timestamp?: number;
};

type RoomMediaViewerProps = {
  items: RoomMediaItem[];
  selectedEventId: string;
  requestClose: () => void;
  selectEvent: (eventId: string) => void;
};

type ResolvedMedia = { item: RoomMediaItem; src: string };

const formatSentAt = (ts: number | undefined, hour24Clock: boolean): string | undefined => {
  if (ts === undefined) return undefined;
  const time = timeHourMinute(ts, hour24Clock);
  if (today(ts)) return `Today at ${time}`;
  if (yesterday(ts)) return `Yesterday at ${time}`;
  return `${timeDayMonthYear(ts)} at ${time}`;
};

function ResolvedRoomMedia({
  item,
  requestClose,
  onPrevious,
  onNext,
}: {
  item: RoomMediaItem;
  requestClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const createObjectURL = useCreateObjectURL();
  const [hour24Clock] = useSetting(settingsAtom, 'hour24Clock');
  const rawMediaUrl = useMemo(
    () => (item.url.startsWith('http') ? item.url : mxcUrlToHttp(mx, item.url, useAuthentication)),
    [item.url, mx, useAuthentication]
  );
  const tauri = isTauri();
  // Tauri resolves the source inside the effect instead.
  const resolvedMediaUrl = useRenderableMediaUrl(
    item.encInfo || tauri ? undefined : (rawMediaUrl ?? undefined)
  );

  const [resolved, setResolved] = useState<ResolvedMedia>();
  const [error, setError] = useState<Error>();
  const [retryToken, setRetryToken] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;
    const request = requestRef.current;
    setError(undefined);
    const resolve = async () => {
      const { encInfo, mimeType } = item;
      if (encInfo) {
        if (!rawMediaUrl) throw new Error('Invalid media URL');
        if (tauri) {
          await setMediaEncryption(rawMediaUrl, encInfo, mimeType ?? FALLBACK_MIMETYPE);
          return rewriteAuthenticatedMediaUrl(rawMediaUrl)!;
        }
        return createObjectURL(
          downloadEncryptedMedia(rawMediaUrl, (buffer) =>
            decryptFile(buffer, mimeType ?? FALLBACK_MIMETYPE, encInfo)
          )
        );
      }
      if (tauri && rawMediaUrl) return prepareLoopbackImageSource(rawMediaUrl);
      return resolvedMediaUrl ?? rawMediaUrl ?? item.url;
    };

    resolve()
      .then((src) => {
        if (requestRef.current !== request) return;
        setResolved((prev) => (prev?.item === item && prev.src === src ? prev : { item, src }));
      })
      .catch((err) => {
        if (requestRef.current !== request) return;
        setError(err instanceof Error ? err : new Error('Failed to load media'));
      });
  }, [item, rawMediaUrl, resolvedMediaUrl, tauri, createObjectURL, retryToken]);

  const loading = !error && resolved?.item.eventId !== item.eventId;
  const showingResolved = resolved?.item.eventId === item.eventId;

  return (
    <>
      {resolved && showingResolved && !error && (
        <ImageViewer
          alt={resolved.item.body}
          filename={resolved.item.filename}
          src={resolved.src}
          info={resolved.item.info}
          sender={resolved.item.sender}
          sentAt={formatSentAt(resolved.item.timestamp, hour24Clock)}
          requestClose={requestClose}
          onPrevious={onPrevious}
          onNext={onNext}
          getDownloadBlob={
            item.encInfo && rawMediaUrl
              ? () =>
                  downloadEncryptedMedia(rawMediaUrl, (buffer) =>
                    decryptFile(buffer, item.mimeType ?? FALLBACK_MIMETYPE, item.encInfo!)
                  )
              : undefined
          }
        />
      )}
      {loading && (
        <Box
          grow="Yes"
          alignItems="Center"
          justifyContent="Center"
          style={resolved ? { position: 'absolute', inset: 0, background: '#0009' } : undefined}
        >
          <Spinner variant="Secondary" size="400" />
        </Box>
      )}
      {error && (
        <Box
          grow="Yes"
          alignItems="Center"
          justifyContent="Center"
          direction="Column"
          gap="200"
          style={
            resolved
              ? { position: 'absolute', inset: 0, background: '#000c' }
              : { background: '#000' }
          }
        >
          <Text size="T300" style={{ color: '#fff' }}>
            Failed to load media
          </Text>
          <Chip
            as="button"
            variant="Primary"
            radii="300"
            outlined
            onClick={() => setRetryToken((token) => token + 1)}
          >
            <Text size="B300">Retry</Text>
          </Chip>
        </Box>
      )}
    </>
  );
}

export function RoomMediaViewer({
  items,
  selectedEventId,
  requestClose,
  selectEvent,
}: RoomMediaViewerProps) {
  const selectedIndex = items.findIndex((mediaItem) => mediaItem.eventId === selectedEventId);
  const item = items[selectedIndex];

  useEffect(() => {
    if (!item) requestClose();
  }, [item, requestClose]);

  if (!item) return null;

  return (
    <ModalOverlay
      open
      requestClose={requestClose}
      mobile="fullscreen"
      background="#000"
      respectSafeArea={false}
    >
      <ResolvedRoomMedia
        item={item}
        requestClose={requestClose}
        onPrevious={
          selectedIndex > 0 ? () => selectEvent(items[selectedIndex - 1]!.eventId) : undefined
        }
        onNext={
          selectedIndex < items.length - 1
            ? () => selectEvent(items[selectedIndex + 1]!.eventId)
            : undefined
        }
      />
    </ModalOverlay>
  );
}
