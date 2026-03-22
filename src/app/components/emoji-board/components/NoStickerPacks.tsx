import { Box, toRem, config, Text } from 'folds';
import { StickerIcon } from '@phosphor-icons/react/dist/csr/Sticker';
import { PhosphorIcon } from '$components/PhosphorIcon';

export function NoStickerPacks() {
  return (
    <Box
      style={{ padding: `${toRem(60)} ${config.space.S500}` }}
      alignItems="Center"
      justifyContent="Center"
      direction="Column"
      gap="300"
    >
      <PhosphorIcon size="600" as={StickerIcon} />
      <Box direction="Inherit">
        <Text align="Center">No Sticker Packs!</Text>
        <Text priority="300" align="Center" size="T200">
          Add stickers from user, room or space settings.
        </Text>
      </Box>
    </Box>
  );
}
