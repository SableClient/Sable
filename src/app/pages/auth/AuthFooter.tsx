import { Box, Text } from 'folds';
import { versionLabel } from '$utils/platform';
import * as css from './styles.css';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text as="a" size="T300" href="https://app.sable.moe" target="_blank" rel="noreferrer">
        About
      </Text>
      <Text
        as="a"
        size="T300"
        href="https://github.com/SableClient/Sable"
        target="_blank"
        rel="noreferrer"
      >
        {versionLabel()}
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        Powered by Matrix
      </Text>
    </Box>
  );
}
