import { useEffect } from 'react';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { ImageViewer } from '$components/image-viewer';
import { useObjectURL } from '$hooks/useObjectURL';
import { wrapIndex } from '$utils/common';
import type { TUploadItem } from '$state/room/roomInputDrafts';

type StagedUploadViewerProps = {
  items: TUploadItem[];
  index: number;
  requestClose: () => void;
  selectIndex: (index: number) => void;
};

function StagedImageSlide({
  item,
  requestClose,
  onPrevious,
  onNext,
  atStart,
  atEnd,
}: {
  item: TUploadItem;
  requestClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  atStart?: boolean;
  atEnd?: boolean;
}) {
  const fileUrl = useObjectURL(item.originalFile);
  if (!fileUrl) return null;
  return (
    <ImageViewer
      alt={item.originalFile.name}
      filename={item.originalFile.name}
      src={fileUrl}
      getDownloadBlob={() => Promise.resolve(item.originalFile)}
      requestClose={requestClose}
      onPrevious={onPrevious}
      onNext={onNext}
      atStart={atStart}
      atEnd={atEnd}
    />
  );
}

/** The staged composer attachments form a local bundle: the opened image can be
 *  navigated with arrows or chevrons before it is sent. */
export function StagedUploadViewer({
  items,
  index,
  requestClose,
  selectIndex,
}: StagedUploadViewerProps) {
  useEffect(() => {
    if (items.length === 0 || index < 0 || index >= items.length) requestClose();
  }, [items.length, index, requestClose]);

  if (items.length === 0 || index < 0 || index >= items.length) return null;
  const item = items[index]!;

  const selectRelative = (offset: number) => selectIndex(wrapIndex(index, offset, items.length));

  return (
    <ModalOverlay open requestClose={requestClose} background="#000" respectSafeArea={false}>
      <StagedImageSlide
        item={item}
        requestClose={requestClose}
        onPrevious={items.length > 1 ? () => selectRelative(-1) : undefined}
        onNext={items.length > 1 ? () => selectRelative(1) : undefined}
        atStart={index === 0}
        atEnd={index === items.length - 1}
      />
    </ModalOverlay>
  );
}
