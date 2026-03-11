import { Box, Text } from 'folds';
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
        {`v${APP_VERSION}${IS_RELEASE_TAG ? '' : `-dev${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`}`}
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        Powered by Matrix
      </Text>
    </Box>
  );
}
