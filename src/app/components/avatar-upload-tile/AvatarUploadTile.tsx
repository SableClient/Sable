import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Box, Text, Button, Modal } from 'folds';
import { SettingTile } from '$components/setting-tile';
import { useObjectURL } from '$hooks/useObjectURL';
import type { UploadSuccess } from '$state/upload';
import { createUploadAtom } from '$state/upload';
import { useFilePicker } from '$hooks/useFilePicker';
import { CompactUploadCardRenderer } from '$components/upload-card';
import { ImageEditor } from '$components/image-editor';
import { ModalWide } from '$styles/Modal.css';
import { ModalOverlay } from '$components/modal-overlay/ModalOverlay';
import { confirm } from '$components/confirm/confirm';

export type AvatarUploadTileProps = {
  title: string;
  focusId?: string;
  after: ReactNode;
  disableSetAvatar?: boolean;
  removeDisabled?: boolean;
  onUpload: (mxc: string) => void;
  onRemove: () => void;
  confirmTitle: string;
  confirmDescription: string;
};

export function AvatarUploadTile({
  title,
  focusId,
  after,
  disableSetAvatar = false,
  removeDisabled = false,
  onUpload,
  onRemove,
  confirmTitle,
  confirmDescription,
}: AvatarUploadTileProps) {
  const [imageFile, setImageFile] = useState<File>();
  const imageFileURL = useObjectURL(imageFile);
  const uploadAtom = useMemo(() => {
    if (imageFile) return createUploadAtom(imageFile);
    return undefined;
  }, [imageFile]);

  const pickFile = useFilePicker(setImageFile, false);

  const handleRemoveUpload = useCallback(() => {
    setImageFile(undefined);
  }, []);

  const handleUploaded = useCallback(
    (upload: UploadSuccess) => {
      onUpload(upload.mxc);
      handleRemoveUpload();
    },
    [onUpload, handleRemoveUpload]
  );

  const handleRemoveAvatar = useCallback(async () => {
    const ok = await confirm({
      title: confirmTitle,
      description: confirmDescription,
      action: 'Remove',
      variant: 'Critical',
    });
    if (ok) {
      onRemove();
    }
  }, [confirmTitle, confirmDescription, onRemove]);

  return (
    <SettingTile title={title} focusId={focusId} after={after}>
      {uploadAtom ? (
        <Box gap="200" direction="Column">
          <CompactUploadCardRenderer
            uploadAtom={uploadAtom}
            onRemove={handleRemoveUpload}
            onComplete={handleUploaded}
          />
        </Box>
      ) : (
        <Box gap="200">
          <Button
            onClick={() => pickFile('image/*')}
            size="300"
            variant="Secondary"
            fill="Soft"
            outlined
            radii="300"
            disabled={disableSetAvatar}
          >
            <Text size="B300">Upload</Text>
          </Button>
          {!removeDisabled && (
            <Button
              size="300"
              variant="Critical"
              fill="None"
              radii="300"
              disabled={disableSetAvatar}
              onClick={handleRemoveAvatar}
            >
              <Text size="B300">Remove</Text>
            </Button>
          )}
        </Box>
      )}

      {imageFileURL && (
        <ModalOverlay open={false} requestClose={handleRemoveUpload}>
          <Modal className={ModalWide} variant="Surface" size="500">
            <ImageEditor
              name={imageFile?.name ?? 'Unnamed'}
              url={imageFileURL}
              requestClose={handleRemoveUpload}
            />
          </Modal>
        </ModalOverlay>
      )}
    </SettingTile>
  );
}
