import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useImperativeHandle } from 'react';
import { Badge, Box, Chip, Header, Spinner, Text, as, percent } from 'folds';
import { CaretRight, CaretUp, X, sizedIcon } from '$components/icons/phosphor';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';

import type { TUploadFamilyObserverAtom, Upload } from '$state/upload';
import { UploadStatus } from '$state/upload';
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

// Progress ticks re-render this header, so the caller reads uploads on demand here
// instead of subscribing to them itself.
export type UploadBoardImperativeHandlers = { getSendableUploads: () => Upload[] };

type UploadBoardHeaderProps = {
  open: boolean;
  onToggle: () => void;
  uploadFamilyObserverAtom: TUploadFamilyObserverAtom;
  onCancel: (uploads: Upload[]) => void;
  onBusyChange?: (busy: boolean) => void;
  imperativeHandlerRef: MutableRefObject<UploadBoardImperativeHandlers | undefined>;
};

export function UploadBoardHeader({
  open,
  onToggle,
  uploadFamilyObserverAtom,
  onCancel,
  onBusyChange,
  imperativeHandlerRef,
}: UploadBoardHeaderProps) {
  const uploads = useAtomValue(uploadFamilyObserverAtom);

  const isSuccess = uploads.every((upload) => upload.status === UploadStatus.Success);
  const isError = uploads.some((upload) => upload.status === UploadStatus.Error);
  const busy = uploads.length > 0 && !isSuccess && !isError;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
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

  useImperativeHandle(imperativeHandlerRef, () => ({
    getSendableUploads: () =>
      uploads.filter(
        (upload) => upload.status === UploadStatus.Success || upload.status === UploadStatus.Loading
      ),
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
        {sizedIcon(open ? CaretUp : CaretRight, '50')}
        <Text size="H6">Files</Text>
      </Box>
      <Box className={css.UploadBoardHeaderContent} alignItems="Center" gap="100">
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
        {open && (
          <Chip
            as="button"
            onClick={handleCancel}
            variant="SurfaceVariant"
            radii="Pill"
            after={sizedIcon(X, '50')}
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
    direction="Row"
    gap="200"
    {...props}
    ref={ref}
  >
    {children}
  </Box>
));
