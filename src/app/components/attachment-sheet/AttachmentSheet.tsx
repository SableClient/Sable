import { type RefObject, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDrag } from '@use-gesture/react';
import FocusTrap from 'focus-trap-react';
import { useAndroidBackHandler } from '$utils/androidBack';
import { stopPropagation } from '$utils/keyboard';
import { mobileOrTablet } from '$utils/user-agent';
import { getMobileSheetTiming, useMobileSheetAnimation } from '$components/mobileSheetAnimation';
import * as animationCss from '$components/mobileSheetAnimation.css';
import type { Icon } from '@phosphor-icons/react';
import {
  Image as ImageIcon,
  PlusCircle,
  ListBullets,
  MapPinPlusIcon,
  GridFour,
} from '$components/icons/phosphor';
import * as css from './AttachmentSheet.css';

interface AttachmentAction {
  icon: Icon;
  label: string;
  onClick: () => void;
}

export interface AttachmentSheetProps {
  open: boolean;
  onClose: () => void;
  onPickPhotos: () => void;
  onPickFile: () => void;
  onPickPoll: () => void;
  onPickLocation: () => void;
  containerRef: RefObject<HTMLElement>;
}

const SWIPE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 0.5;

export function AttachmentSheet({
  open,
  onClose,
  onPickPhotos,
  onPickFile,
  onPickPoll,
  onPickLocation,
  containerRef,
}: AttachmentSheetProps) {
  const containerEl = containerRef.current;
  const sheetRef = useRef<HTMLDivElement>(null);
  const skipReturnFocusRef = useRef(false);
  const dragYRef = useRef(0);
  const resetAnimationRef = useRef<Animation>();
  const { shouldReduceMotion } = useMobileSheetAnimation();

  useLayoutEffect(() => {
    if (open) {
      skipReturnFocusRef.current = false;
      dragYRef.current = 0;
      resetAnimationRef.current?.cancel();
      if (sheetRef.current) sheetRef.current.style.transform = '';
    }
  }, [open]);

  useAndroidBackHandler(() => {
    onClose();
    return true;
  }, open);

  const gesturesEnabled = mobileOrTablet();

  const bind = useDrag(
    ({ first, active, offset: [, oy], velocity: [, vy], direction: [, dy], event }) => {
      if (event && 'target' in event && event.target instanceof Element) {
        if (event.target.closest('[data-gestures="ignore"]')) {
          return;
        }
      }

      if (!gesturesEnabled) return;

      event.stopPropagation();

      const val = Math.max(0, oy);

      if (active) {
        if (first) {
          resetAnimationRef.current?.cancel();
          sheetRef.current?.getAnimations().forEach((animation) => animation.cancel());
        }
        dragYRef.current = val;
        if (sheetRef.current) {
          sheetRef.current.style.transform = `translate3d(0, ${val}px, 0)`;
        }
      } else {
        const swipedDown = val > SWIPE_THRESHOLD || (vy > VELOCITY_THRESHOLD && dy > 0);

        if (swipedDown) {
          onClose();
        } else if (sheetRef.current) {
          const sheet = sheetRef.current;
          resetAnimationRef.current = sheet.animate(
            [
              { transform: `translate3d(0, ${dragYRef.current}px, 0)` },
              { transform: 'translate3d(0, 0, 0)' },
            ],
            getMobileSheetTiming(shouldReduceMotion)
          );
          resetAnimationRef.current.addEventListener(
            'finish',
            () => {
              dragYRef.current = 0;
              sheet.style.transform = '';
            },
            { once: true }
          );
        }
      }
    },
    {
      axis: 'y',
      bounds: { top: 0, bottom: 300 },
      rubberband: true,
      filterTaps: true,
      pointer: { capture: true },
      from: () => [0, dragYRef.current],
    }
  );

  const actions: AttachmentAction[] = [
    { icon: PlusCircle, label: 'Add File', onClick: onPickFile },
    { icon: ListBullets, label: 'Create Poll', onClick: onPickPoll },
    { icon: MapPinPlusIcon, label: 'Add Location', onClick: onPickLocation },
  ];

  const handleAction = (action: () => void) => {
    skipReturnFocusRef.current = true;
    action();
  };

  const sheetContent = (
    <>
      <div
        className={css.SheetHeader}
        {...(gesturesEnabled ? bind() : {})}
        style={gesturesEnabled ? { touchAction: 'none' } : undefined}
      >
        <div className={css.DragHandle} aria-hidden="true" />
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
    </>
  );

  const sheetElement = open ? (
    <>
      <div
        className={`${css.Backdrop} ${animationCss.BackdropEntrance}`}
        style={shouldReduceMotion ? { animation: 'none' } : undefined}
        onClick={onClose}
        onPointerDown={(event) => event.stopPropagation()}
        data-gestures="ignore"
        aria-hidden="true"
      />

      <FocusTrap
        focusTrapOptions={{
          // Moving focus to the bottom sheet makes iOS reposition the visual viewport
          // and briefly jolts the timeline. Existing mobile sheets leave focus in place.
          initialFocus: false,
          fallbackFocus: () => sheetRef.current ?? containerEl,
          preventScroll: true,
          returnFocusOnDeactivate: true,
          setReturnFocus: (previousActiveElement: HTMLElement) =>
            skipReturnFocusRef.current ? false : previousActiveElement,
          allowOutsideClick: true,
          clickOutsideDeactivates: false,
          escapeDeactivates: (event: KeyboardEvent) => {
            if (!stopPropagation(event)) return false;
            onClose();
            return false;
          },
        }}
      >
        <div
          ref={sheetRef}
          className={`${css.Sheet} ${animationCss.SheetEntrance}`}
          style={shouldReduceMotion ? { animation: 'none' } : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby="attachment-sheet-title"
          tabIndex={-1}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {sheetContent}
        </div>
      </FocusTrap>
    </>
  ) : null;

  // Never render inline: without the active pane as a portal target, the sheet
  // could briefly anchor to the room layout and cover the sidebar.
  if (!containerEl) return null;

  return createPortal(sheetElement, containerEl);
}
