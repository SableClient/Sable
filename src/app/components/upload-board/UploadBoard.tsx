import { MutableRefObject, ReactNode, useImperativeHandle, useRef } from 'react';
import { Badge, Box, Chip, Header, Spinner, Text, as, percent } from 'folds';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp';
import { PaperPlaneIcon } from '@phosphor-icons/react/dist/csr/PaperPlane';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';

import { TUploadFamilyObserverAtom, Upload, UploadStatus, UploadSuccess } from '$state/upload';
import { PhosphorIcon } from '$components/PhosphorIcon';
import * as css from './UploadBoard.css';

type UploadBoardProps = {
  header: ReactNode;
};
export const UploadBoard = as<'div', UploadBoardProps>(({ header, children, ...props }, ref) => (
  <Box className={css.UploadBoardBase} {...props} ref={ref}>
    <Box className={css.UploadBoardContainer} justifyContent="End">
      <Box className={classNames(css.UploadBoard)} direction="Column">
        <Box grow="Yes" direction="Column">
          {children}
        </Box>
        <Box direction="Column" shrink="No">
          {header}
        </Box>
      </Box>
    </Box>
  </Box>
));

export type UploadBoardImperativeHandlers = { handleSend: () => Promise<void> };

type UploadBoardHeaderProps = {
  open: boolean;
  onToggle: () => void;
  uploadFamilyObserverAtom: TUploadFamilyObserverAtom;
  onCancel: (uploads: Upload[]) => void;
  onSend: (uploads: UploadSuccess[]) => Promise<void>;
  imperativeHandlerRef: MutableRefObject<UploadBoardImperativeHandlers | undefined>;
};

export function UploadBoardHeader({
  open,
  onToggle,
  uploadFamilyObserverAtom,
  onCancel,
  onSend,
  imperativeHandlerRef,
}: UploadBoardHeaderProps) {
  const sendingRef = useRef(false);
  const uploads = useAtomValue(uploadFamilyObserverAtom);

  const isSuccess = uploads.every((upload) => upload.status === UploadStatus.Success);
  const isError = uploads.some((upload) => upload.status === UploadStatus.Error);
  const progress = uploads.reduce(
    (acc, upload) => {
      acc.total += upload.file.size;
      if (upload.status === UploadStatus.Loading) {
        acc.loaded += upload.progress.loaded;
      }
      if (upload.status === UploadStatus.Success) {
        acc.loaded += upload.file.size;
      }
      return acc;
    },
    { loaded: 0, total: 0 }
  );

  const handleSend = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    await onSend(uploads.filter((upload) => upload.status === UploadStatus.Success));
    sendingRef.current = false;
  };

  useImperativeHandle(imperativeHandlerRef, () => ({
    handleSend,
  }));
  const handleCancel = () => onCancel(uploads);

  return (
    <Header size="400">
      <Box
        as="button"
        style={{ cursor: 'pointer' }}
        onClick={onToggle}
        className={css.UploadBoardHeaderContent}
        alignItems="Center"
        grow="Yes"
        gap="100"
      >
        <PhosphorIcon as={open ? CaretUpIcon : CaretRightIcon} size="50" />
        <Text size="H6">Files</Text>
      </Box>
      <Box className={css.UploadBoardHeaderContent} alignItems="Center" gap="100">
        {isSuccess && (
          <Chip
            as="button"
            onClick={handleSend}
            variant="Primary"
            radii="Pill"
            outlined
            after={<PhosphorIcon as={PaperPlaneIcon} size="50" weight="fill" />}
          >
            <Text size="B300">Send</Text>
          </Chip>
        )}
        {isError && !open && (
          <Badge variant="Critical" fill="Solid" radii="300">
            <Text size="L400">Upload Failed</Text>
          </Badge>
        )}
        {!isSuccess && !isError && !open && (
          <>
            <Badge variant="Secondary" fill="Solid" radii="Pill">
              <Text size="L400">{Math.round(percent(0, progress.total, progress.loaded))}%</Text>
            </Badge>
            <Spinner variant="Secondary" size="200" />
          </>
        )}
        {!isSuccess && open && (
          <Chip
            as="button"
            onClick={handleCancel}
            variant="SurfaceVariant"
            radii="Pill"
            after={<PhosphorIcon as={XIcon} size="50" />}
          >
            <Text size="B300">{uploads.length === 1 ? 'Remove' : 'Remove All'}</Text>
          </Chip>
        )}
      </Box>
    </Header>
  );
}

export const UploadBoardContent = as<'div'>(({ className, children, ...props }, ref) => (
  <Box
    className={classNames(css.UploadBoardContent, className)}
    direction="Column"
    gap="200"
    {...props}
    ref={ref}
  >
    {children}
  </Box>
));
