import type { MutableRefObject } from 'react';
import type { Icon } from '@phosphor-icons/react';
import {
  GridFour,
  Image as ImageIcon,
  ListBullets,
  MapPinPlusIcon,
  PlusCircle,
} from '$components/icons/phosphor';
import * as css from './AttachmentContent.css';
import { useMobileSheetClose } from '$components/MobileSwipeDownModal';

interface AttachmentAction {
  icon: Icon;
  label: string;
  onClick: () => void;
}

export interface AttachmentContentProps {
  onPickPhotos: () => void;
  onPickFile: () => void;
  onPickPoll: () => void;
  onPickLocation: () => void;
  skipReturnFocusRef: MutableRefObject<boolean>;
}

export function AttachmentContent({
  onPickPhotos,
  onPickFile,
  onPickPoll,
  onPickLocation,
  skipReturnFocusRef,
}: AttachmentContentProps) {
  const mobileSheetClose = useMobileSheetClose();
  const actions: AttachmentAction[] = [
    { icon: PlusCircle, label: 'Add File', onClick: onPickFile },
    { icon: ListBullets, label: 'Create Poll', onClick: onPickPoll },
    { icon: MapPinPlusIcon, label: 'Add Location', onClick: onPickLocation },
  ];

  const handleAction = (action: () => void) => {
    skipReturnFocusRef.current = true;
    action();
    mobileSheetClose?.();
  };

  return (
    <div className={css.Sheet}>
      <div className={css.SheetHeader}>
        <h2 id="attachment-sheet-title" className={css.Heading}>
          Share
        </h2>
      </div>

      <div className={css.GallerySection}>
        <button
          type="button"
          className={css.GalleryButton}
          onClick={() => handleAction(onPickPhotos)}
          data-gestures="ignore"
          aria-label="Open photo gallery"
        >
          <div className={css.GalleryIcon} aria-hidden="true">
            <ImageIcon size={28} weight="regular" />
          </div>
          <span className={css.GalleryCopy}>
            <span className={css.GalleryTitle}>Photos</span>
            <span className={css.GalleryLabel}>Choose from your device</span>
          </span>
          <div className={css.GalleryGrid} aria-hidden="true">
            <GridFour size={22} weight="regular" />
          </div>
        </button>
      </div>

      <div className={css.ActionsRow}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={css.ActionButton}
            onClick={() => handleAction(action.onClick)}
            data-gestures="ignore"
            aria-label={action.label}
          >
            <span className={css.ActionIcon} aria-hidden="true">
              <action.icon size={26} weight="regular" />
            </span>
            <span className={css.ActionLabel}>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
