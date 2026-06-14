import { Box, Button, Text, config, toRem } from 'folds';
import { Code, Heart, menuIcon } from '$components/icons/phosphor';
import { Page, PageHero, PageHeroSection } from '$components/page';
import LogoSVG from '$public/res/svg/logo.svg';
import {
  APP_ATTRIBUTION,
  APP_DESCRIPTION,
  APP_NAME,
  APP_SOURCE_URL,
  APP_SUPPORT_URL,
} from '$app/config/brand';

export function WelcomePage() {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400, paddingBottom: config.space.S700 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          <PageHero
            icon={<img width="70" height="70" src={LogoSVG} alt={`${APP_NAME} logo`} />}
            title={`Welcome to ${APP_NAME}`}
            subTitle={
              <span>
                {APP_DESCRIPTION} {APP_ATTRIBUTION}{' '}
                <a href={APP_SOURCE_URL} target="_blank" rel="noreferrer noopener">
                  {`v${APP_VERSION}${IS_RELEASE_TAG ? '' : `-dev${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`}`}
                </a>
              </span>
            }
          >
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href={APP_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  before={menuIcon(Code)}
                >
                  <Text as="span" size="B400" truncate>
                    Source Code
                  </Text>
                </Button>
                <Button
                  as="a"
                  href={APP_SUPPORT_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  fill="Soft"
                  before={menuIcon(Heart)}
                >
                  <Text as="span" size="B400" truncate>
                    Support
                  </Text>
                </Button>
              </Box>
            </Box>
            <Box direction="Column" gap="200" alignItems="Center">
              <Button
                as="a"
                href="https://github.com/SableClient/Sable/blob/dev/CHANGELOG.md"
                target="_blank"
                rel="noreferrer noopener"
                before={menuIcon(Code)}
              >
                <Text as="span" size="B400" truncate>
                  Features
                </Text>
              </Button>
            </Box>
          </PageHero>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
