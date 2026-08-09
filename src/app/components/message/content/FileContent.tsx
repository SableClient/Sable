import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Box, Button, Modal, Spinner, Text, Tooltip, as } from 'folds';
import { TooltipProvider } from '$components/overlay-stack';
import { ArrowRight, Download, sizedIcon, Warning } from '$components/icons/phosphor';
import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { IFileInfo } from '$types/matrix/common';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { bytesToSize } from '$utils/common';
import {
  READABLE_EXT_TO_MIME_TYPE,
  READABLE_TEXT_MIME_TYPES,
  getFileNameExt,
  mimeTypeToExt,
} from '$utils/mimeTypes';
import { decryptFile, downloadEncryptedMedia, downloadMedia, mxcUrlToHttp } from '$utils/matrix';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { useCreateObjectURL } from '$hooks/useObjectURL';
import { useDismissOnBack } from '$utils/androidBack';
import { ModalWide } from '$styles/Modal.css';
import { getDownloadFilename, saveFileToDevice } from '$utils/download';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';

const renderErrorButton = (retry: () => void, text: string) => (
  <TooltipProvider
    tooltip={
      <Tooltip variant="Critical">
        <Text>Failed to load file!</Text>
      </Tooltip>
    }
    position="Top"
    align="Center"
  >
    {(triggerRef) => (
      <Button
        ref={triggerRef}
        size="400"
        variant="Critical"
        fill="Soft"
        outlined
        radii="300"
        onClick={retry}
        before={sizedIcon(Warning, '100', { filled: true })}
      >
        <Text size="B400" truncate>
          {text}
        </Text>
      </Button>
    )}
  </TooltipProvider>
);

type RenderTextViewerProps = {
  name: string;
  text: string;
  langName: string;
  requestClose: () => void;
};
type ReadTextFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderTextViewerProps) => ReactNode;
};
export function ReadTextFile({ body, mimeType, url, encInfo, renderViewer }: ReadTextFileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [textViewer, setTextViewer] = useState(false);

  // Android back closes the text viewer instead of navigating away.
  useDismissOnBack(() => setTextViewer(false), textViewer);

  const [textState, loadText] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? await downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : await downloadMedia(mediaUrl);

      const text = fileContent.text();
      setTextViewer(true);
      return text;
    }, [mx, useAuthentication, mimeType, encInfo, url])
  );

  return (
    <>
      {textState.status === AsyncStatus.Success && (
        <ModalOverlay open={textViewer} requestClose={() => setTextViewer(false)}>
          <Modal
            className={ModalWide}
            size="500"
            onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}
          >
            {renderViewer({
              name: body,
              text: textState.data,
              langName: READABLE_TEXT_MIME_TYPES.includes(mimeType)
                ? mimeTypeToExt(mimeType)
                : mimeTypeToExt(READABLE_EXT_TO_MIME_TYPE[getFileNameExt(body)] ?? mimeType),
              requestClose: () => setTextViewer(false),
            })}
          </Modal>
        </ModalOverlay>
      )}
      {textState.status === AsyncStatus.Error ? (
        renderErrorButton(loadText, 'Open File')
      ) : (
        <Button
          variant="Secondary"
          fill="Solid"
          radii="300"
          size="400"
          onClick={() =>
            textState.status === AsyncStatus.Success ? setTextViewer(true) : loadText()
          }
          disabled={textState.status === AsyncStatus.Loading}
          before={
            textState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" size="100" variant="Secondary" />
            ) : (
              sizedIcon(ArrowRight, '100', { filled: true })
            )
          }
        >
          <Text size="B400" truncate>
            Open File
          </Text>
        </Button>
      )}
    </>
  );
}

type RenderPdfViewerProps = {
  name: string;
  src: string;
  requestClose: () => void;
};
export type ReadPdfFileProps = {
  body: string;
  mimeType: string;
  url: string;
  encInfo?: EncryptedAttachmentInfo;
  renderViewer: (props: RenderPdfViewerProps) => ReactNode;
};
export function ReadPdfFile({ body, mimeType, url, encInfo, renderViewer }: ReadPdfFileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const [pdfViewer, setPdfViewer] = useState(false);

  // Android back closes the PDF viewer instead of navigating away.
  useDismissOnBack(() => setPdfViewer(false), pdfViewer);

  const createObjectURL = useCreateObjectURL();

  const [pdfState, loadPdf] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContent = encInfo
        ? downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : downloadMedia(mediaUrl);
      const fileURL = await createObjectURL(fileContent);
      setPdfViewer(true);
      return fileURL;
    }, [mx, url, useAuthentication, mimeType, encInfo, createObjectURL])
  );

  return (
    <>
      {pdfState.status === AsyncStatus.Success && (
        <ModalOverlay open={pdfViewer} requestClose={() => setPdfViewer(false)}>
          <Modal
            className={ModalWide}
            size="500"
            onContextMenu={(evt: React.MouseEvent) => evt.stopPropagation()}
          >
            {renderViewer({
              name: body,
              src: pdfState.data,
              requestClose: () => setPdfViewer(false),
            })}
          </Modal>
        </ModalOverlay>
      )}
      {pdfState.status === AsyncStatus.Error ? (
        renderErrorButton(loadPdf, 'Open PDF')
      ) : (
        <Button
          variant="Secondary"
          fill="Solid"
          radii="300"
          size="400"
          onClick={() => (pdfState.status === AsyncStatus.Success ? setPdfViewer(true) : loadPdf())}
          disabled={pdfState.status === AsyncStatus.Loading}
          before={
            pdfState.status === AsyncStatus.Loading ? (
              <Spinner fill="Solid" size="100" variant="Secondary" />
            ) : (
              sizedIcon(ArrowRight, '100', { filled: true })
            )
          }
        >
          <Text size="B400" truncate>
            Open PDF
          </Text>
        </Button>
      )}
    </>
  );
}

export type DownloadFileProps = {
  body: string;
  mimeType: string;
  url: string;
  info: IFileInfo;
  encInfo?: EncryptedAttachmentInfo;
};
export function DownloadFile({ body, mimeType, url, info, encInfo }: DownloadFileProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const createObjectURL = useCreateObjectURL();

  const [downloadState, download] = useAsyncCallback(
    useCallback(async () => {
      const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      const fileContentPromise = encInfo
        ? downloadEncryptedMedia(mediaUrl, (encBuf) => decryptFile(encBuf, mimeType, encInfo))
        : downloadMedia(mediaUrl);
      const fileURL = await createObjectURL(fileContentPromise);
      const fileContent = await fileContentPromise;

      await saveFileToDevice(fileContent, getDownloadFilename(body), mimeType);
      return fileURL;
    }, [mx, url, useAuthentication, mimeType, encInfo, body, createObjectURL])
  );

  return downloadState.status === AsyncStatus.Error ? (
    renderErrorButton(download, `Retry Download (${bytesToSize(info.size ?? 0)})`)
  ) : (
    <Button
      variant="Secondary"
      fill="Soft"
      radii="300"
      size="400"
      onClick={() =>
        downloadState.status === AsyncStatus.Success
          ? void saveFileToDevice(downloadState.data, getDownloadFilename(body), mimeType)
          : download()
      }
      disabled={downloadState.status === AsyncStatus.Loading}
      before={
        downloadState.status === AsyncStatus.Loading ? (
          <Spinner fill="Soft" size="100" variant="Secondary" />
        ) : (
          sizedIcon(Download, '100', { filled: true })
        )
      }
    >
      <Text size="B400" truncate>{`Download (${bytesToSize(info.size ?? 0)})`}</Text>
    </Button>
  );
}

type FileContentProps = {
  body: string;
  mimeType: string;
  renderAsTextFile: () => ReactNode;
  renderAsPdfFile: () => ReactNode;
};
export const FileContent = as<'div', FileContentProps>(
  ({ body, mimeType, renderAsTextFile, renderAsPdfFile, children, ...props }, ref) => (
    <Box direction="Column" gap="300" {...props} ref={ref}>
      {(READABLE_TEXT_MIME_TYPES.includes(mimeType) ||
        READABLE_EXT_TO_MIME_TYPE[getFileNameExt(body)]) &&
        renderAsTextFile()}
      {mimeType === 'application/pdf' && renderAsPdfFile()}
      {children}
    </Box>
  )
);
