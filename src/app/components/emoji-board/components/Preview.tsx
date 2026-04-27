import { Box, Text } from 'folds';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '$utils/matrix';
import * as css from './styles.css';

export type PreviewData = {
  key: string;
  shortcode: string;
};

export const createPreviewDataAtom = (initial?: PreviewData) =>
  atom<PreviewData | undefined>(initial);

type PreviewProps = {
  previewAtom: Atom<PreviewData | undefined>;
};
export function Preview({ previewAtom }: PreviewProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const { key, shortcode } = useAtomValue(previewAtom) ?? {};

  if (!shortcode) return null;

  return (
    <Box shrink="No" className={css.Preview} gap="300" alignItems="Center">
      {key && (
        <Box
          display="InlineFlex"
          className={css.PreviewEmoji}
          alignItems="Center"
          justifyContent="Center"
        >
          {key.startsWith('mxc://') ? (
            <img
              className={css.PreviewImg}
              src={mxcUrlToHttp(mx, key, useAuthentication) ?? key}
              alt={shortcode}
            />
          ) : (
            key
          )}
        </Box>
      )}
      <Text size="H5" truncate>
        :{shortcode}:
      </Text>
    </Box>
  );
}
