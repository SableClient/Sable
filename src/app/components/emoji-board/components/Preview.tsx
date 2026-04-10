import { Box, Text } from 'folds';
import { Atom, atom, useAtomValue } from 'jotai';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '$utils/matrix';
import { AuthenticatedImg } from '$components/AuthenticatedImg';
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
            <AuthenticatedImg
              className={css.PreviewImg}
              src={mxcUrlToHttp(mx, key, useAuthentication) ?? undefined}
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
