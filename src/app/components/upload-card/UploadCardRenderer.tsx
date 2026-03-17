import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Icon,
  IconButton,
  Icons,
  Scroll,
  Text,
  Tooltip,
  TooltipProvider,
  color,
  config,
  toRem,
} from 'folds';
import { type HTMLReactParserOptions } from 'html-react-parser';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { type Opts as LinkifyOpts } from 'linkifyjs';
import { getReactCustomHtmlParser, LINKIFY_OPTS } from '$plugins/react-custom-html-parser';
import { useSpoilerClickHandler } from '$hooks/useSpoilerClickHandler';
import { RenderBody } from '$components/message';
import { UploadStatus, type UploadSuccess, useBindUploadAtom } from '$state/upload';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { type TUploadContent } from '$utils/matrix';
import { bytesToSize, getFileTypeIcon } from '$utils/common';
import {
  roomUploadAtomFamily,
  type TUploadItem,
  type TUploadMetadata,
} from '$state/room/roomInputDrafts';
import { useObjectURL } from '$hooks/useObjectURL';
import { useMediaConfig } from '$hooks/useMediaConfig';
import { UploadCard, UploadCardError, UploadCardProgress } from './UploadCard';
import { DescriptionEditor } from './UploadDescriptionEditor';

type PreviewImageProps = {
  fileItem: TUploadItem;
};
function PreviewImage({ fileItem }: Readonly<PreviewImageProps>) {
  const { originalFile, metadata } = fileItem;
  const fileUrl = useObjectURL(originalFile);

  return (
    <img
      style={{
        objectFit: 'contain',
        width: '100%',
        height: toRem(152),
        filter: metadata.markedAsSpoiler ? 'blur(44px)' : undefined,
      }}
      alt={originalFile.name}
      src={fileUrl}
    />
  );
}

type PreviewVideoProps = {
  fileItem: TUploadItem;
};
function PreviewVideo({ fileItem }: Readonly<PreviewVideoProps>) {
  const { originalFile, metadata } = fileItem;
  const fileUrl = useObjectURL(originalFile);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      style={{
        objectFit: 'contain',
        width: '100%',
        height: toRem(152),
        filter: metadata.markedAsSpoiler ? 'blur(44px)' : undefined,
      }}
      src={fileUrl}
    />
  );
}

type MediaPreviewProps = {
  fileItem: TUploadItem;
  onSpoiler: (marked: boolean) => void;
  children: ReactNode;
};
function MediaPreview({ fileItem, onSpoiler, children }: MediaPreviewProps) {
  const { originalFile, metadata } = fileItem;
  const fileUrl = useObjectURL(originalFile);

  return fileUrl ? (
    <Box
      style={{
        borderRadius: config.radii.R300,
        overflow: 'hidden',
        backgroundColor: 'black',
        position: 'relative',
      }}
    >
      {children}
      <Box
        justifyContent="End"
        style={{
          position: 'absolute',
          bottom: config.space.S100,
          left: config.space.S100,
          right: config.space.S100,
        }}
      >
        <Chip
          variant={metadata.markedAsSpoiler ? 'Warning' : 'Secondary'}
          fill="Soft"
          radii="Pill"
          aria-pressed={metadata.markedAsSpoiler}
          before={<Icon src={Icons.EyeBlind} size="50" />}
          onClick={() => onSpoiler(!metadata.markedAsSpoiler)}
        >
          <Text size="B300">Spoiler</Text>
        </Chip>
      </Box>
    </Box>
  ) : null;
}

type UploadCardRendererProps = {
  isEncrypted?: boolean;
  fileItem: TUploadItem;
  setMetadata: (fileItem: TUploadItem, metadata: TUploadMetadata) => void;
  setDesc: (fileItem: TUploadItem, body: string, formatted_body: string) => void;
  onRemove: (file: TUploadContent) => void;
  onComplete?: (upload: UploadSuccess) => void;
  roomId: string;
};
export function UploadCardRenderer({
  isEncrypted,
  fileItem,
  setMetadata,
  setDesc,
  onRemove,
  onComplete,
  roomId,
}: Readonly<UploadCardRendererProps>) {
  const mx = useMatrixClient();
  const mediaConfig = useMediaConfig();
  const allowSize = mediaConfig['m.upload.size'] || Infinity;

  const uploadAtom = roomUploadAtomFamily(fileItem.file);
  const { metadata } = fileItem;
  const { upload, startUpload, cancelUpload } = useBindUploadAtom(mx, uploadAtom, isEncrypted);
  const { file } = upload;
  const fileSizeExceeded = file.size >= allowSize;

  const [isDescribed, setIsDescribed] = useState(false);

  if (upload.status === UploadStatus.Idle && !fileSizeExceeded) {
    startUpload();
  }

  const handleSpoiler = (marked: boolean) => {
    setMetadata(fileItem, { ...metadata, markedAsSpoiler: marked });
  };

  const removeUpload = () => {
    cancelUpload();
    onRemove(file);
  };

  useEffect(() => {
    if (upload.status === UploadStatus.Success) {
      onComplete?.(upload);
    }
  }, [upload, onComplete]);

  const linkifyOpts = useMemo<LinkifyOpts>(() => ({ ...LINKIFY_OPTS }), []);

  const spoilerClickHandler = useSpoilerClickHandler();
  const useAuthentication = useMediaAuthentication();
  const htmlReactParserOptions = useMemo<HTMLReactParserOptions>(
    () =>
      getReactCustomHtmlParser(mx, roomId, {
        linkifyOpts,
        useAuthentication,
        handleSpoilerClick: spoilerClickHandler,
      }),
    [linkifyOpts, mx, roomId, spoilerClickHandler, useAuthentication]
  );
  return (
    <UploadCard
      radii="300"
      before={<Icon src={getFileTypeIcon(Icons, file.type)} />}
      after={
        <>
          {upload.status === UploadStatus.Error && (
            <Chip
              as="button"
              onClick={startUpload}
              aria-label="Retry Upload"
              variant="Critical"
              radii="Pill"
              outlined
            >
              <Text size="B300">Retry</Text>
            </Chip>
          )}
          {!isDescribed && (
            <IconButton
              onClick={() => {
                setIsDescribed(true);
              }}
              aria-label="Add Upload Description"
              variant="SurfaceVariant"
              radii="Pill"
              size="300"
            >
              <Icon src={Icons.Pencil} size="50" />
            </IconButton>
          )}
          {isDescribed && (
            <TooltipProvider
              delay={400}
              position="Top"
              style={{ textAlign: 'center' }}
              tooltip={
                <Tooltip>
                  <Text size="H5">
                    Don&apos;t forget to save your description before sending the message!
                  </Text>
                </Tooltip>
              }
            >
              {(triggerRef) => <Icon ref={triggerRef} src={Icons.Info} size="50" />}
            </TooltipProvider>
          )}

          <IconButton
            onClick={removeUpload}
            aria-label="Cancel Upload"
            variant="SurfaceVariant"
            radii="Pill"
            size="300"
          >
            <Icon src={Icons.Cross} size="200" />
          </IconButton>
        </>
      }
      bottom={
        <>
          {fileItem.originalFile.type.startsWith('image') && (
            <MediaPreview fileItem={fileItem} onSpoiler={handleSpoiler}>
              <PreviewImage fileItem={fileItem} />
            </MediaPreview>
          )}
          {fileItem.originalFile.type.startsWith('video') && (
            <MediaPreview fileItem={fileItem} onSpoiler={handleSpoiler}>
              <PreviewVideo fileItem={fileItem} />
            </MediaPreview>
          )}
          {upload.status === UploadStatus.Idle && !fileSizeExceeded && (
            <UploadCardProgress sentBytes={0} totalBytes={file.size} />
          )}
          {upload.status === UploadStatus.Loading && (
            <UploadCardProgress sentBytes={upload.progress.loaded} totalBytes={file.size} />
          )}
          {upload.status === UploadStatus.Error && (
            <UploadCardError>
              <Text size="T200">{upload.error.message}</Text>
            </UploadCardError>
          )}
          {upload.status === UploadStatus.Idle && fileSizeExceeded && (
            <UploadCardError>
              <Text size="T200">
                The file size exceeds the limit. Maximum allowed size is{' '}
                <b>{bytesToSize(allowSize)}</b>, but the uploaded file is{' '}
                <b>{bytesToSize(file.size)}</b>.
              </Text>
            </UploadCardError>
          )}

          {isDescribed && (
            <DescriptionEditor
              value={fileItem.formatted_body || fileItem.body}
              onSave={(plainText, htmlContent) => {
                setDesc(fileItem, plainText, htmlContent);
                setIsDescribed(false);
              }}
              onCancel={() => setIsDescribed(false)}
            />
          )}
          {!isDescribed && fileItem.body && fileItem.body.length > 0 && (
            <Scroll
              direction="Vertical"
              variant="SurfaceVariant"
              visibility="Always"
              size="300"
              style={{
                backgroundColor: 'var(--sable-bg-container)',
                borderRadius: config.radii.R400,
                maxHeight: '180px',
                marginTop: config.space.S0,
                overflowY: 'auto',
              }}
            >
              <Box style={{ padding: config.space.S200, wordBreak: 'break-word' }}>
                <Text size="T200" priority="400" as="div">
                  <RenderBody
                    body={fileItem.body}
                    customBody={fileItem.formatted_body}
                    htmlReactParserOptions={htmlReactParserOptions}
                    linkifyOpts={linkifyOpts}
                  />
                </Text>
              </Box>
            </Scroll>
          )}
        </>
      }
    >
      <Text size="H6" truncate>
        {file.name}
      </Text>
      {upload.status === UploadStatus.Success && (
        <Icon style={{ color: color.Success.Main }} src={Icons.Check} size="100" />
      )}
    </UploadCard>
  );
}
