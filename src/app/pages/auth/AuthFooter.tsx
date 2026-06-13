import { Box, Text } from 'folds';
import { APP_SOURCE_URL, APP_SUPPORT_URL } from '$app/config/brand';
import * as css from './styles.css';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text as="a" size="T300" href={APP_SUPPORT_URL} target="_blank" rel="noreferrer">
        About
      </Text>
      <Text as="a" size="T300" href={APP_SOURCE_URL} target="_blank" rel="noreferrer">
        {`v${APP_VERSION}${IS_RELEASE_TAG ? '' : `-dev${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`}`}
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        Powered by Matrix
      </Text>
    </Box>
  );
}
