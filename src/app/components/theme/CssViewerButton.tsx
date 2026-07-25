import { useState } from 'react';
import { IconButton, Modal } from 'folds';

import { Code, sizedIcon } from '$components/icons/phosphor';
import { TextViewer } from '$components/text-viewer';
import { ModalWide } from '$styles/Modal.css';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';

type CssViewerButtonProps = {
  title: string;
  cssText?: string;
  loadCssText?: () => Promise<string>;
  ariaLabel: string;
};

export function CssViewerButton({ title, cssText, loadCssText, ariaLabel }: CssViewerButtonProps) {
  const [open, setOpen] = useState(false);
  const [loadedCssText, setLoadedCssText] = useState('');
  const [loading, setLoading] = useState(false);
  const viewerText = cssText?.trim() ? cssText : loadedCssText;

  if (!cssText?.trim() && !loadCssText) return null;

  const handleOpen = async () => {
    if (viewerText) {
      setOpen(true);
      return;
    }
    if (!loadCssText || loading) return;
    setLoading(true);
    try {
      const loaded = await loadCssText();
      if (!loaded.trim()) return;
      setLoadedCssText(loaded);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <IconButton
        size="300"
        variant="Secondary"
        fill="Soft"
        outlined
        radii="300"
        aria-label={ariaLabel}
        disabled={loading}
        onClick={() => {
          handleOpen().catch(() => undefined);
        }}
      >
        {sizedIcon(Code, '200')}
      </IconButton>
      {open && (
        <ModalOverlay requestClose={() => setOpen(false)}>
          <Modal className={ModalWide} size="500">
            <TextViewer
              name={title}
              text={viewerText}
              langName="css"
              requestClose={() => setOpen(false)}
            />
          </Modal>
        </ModalOverlay>
      )}
    </>
  );
}
