import { Box, Button, Icon, Icons, Text, config, toRem } from 'folds';
import { Page, PageHero, PageHeroSection } from '$components/page';
import CinnySVG from '$public/res/svg/cinny.svg';

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
            icon={<img width="70" height="70" src={CinnySVG} alt="Cinny Logo" />}
            title="Welcome to Sable"
            subTitle={
              <span>
                Yet another matrix client fork.{' '}
                <a
                  href="https://github.com/SableClient/Sable"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {`v${APP_VERSION}${IS_RELEASE_TAG ? '' : `-dev${BUILD_HASH ? ` (${BUILD_HASH})` : ''}`}`}
                </a>
              </span>
            }
          >
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href="https://github.com/SableClient/Sable"
                  target="_blank"
                  rel="noreferrer noopener"
                  before={<Icon size="200" src={Icons.Code} />}
                >
                  <Text as="span" size="B400" truncate>
                    Source Code
                  </Text>
                </Button>
                {/*
                <Button
                  as="a"
                  href="https://github.com/SableClient/Sable"
                  target="_blank"
                  rel="noreferrer noopener"
                  fill="Soft"
                  before={<Icon size="200" src={Icons.Heart} />}
                >
                  <Text as="span" size="B400" truncate>
                    Support
                  </Text>
                </Button>
                */}
              </Box>
            </Box>
            <Box direction="Column" gap="200" alignItems="Center">
              <Button
                as="a"
                href="https://github.com/SableClient/Sable/blob/dev/CHANGELOG.md"
                target="_blank"
                rel="noreferrer noopener"
                before={<Icon size="200" src={Icons.Code} />}
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
