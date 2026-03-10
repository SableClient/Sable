import { Box, Text, IconButton, Icon, Icons, Scroll, Button, config, toRem, Spinner } from 'folds';
import { Page, PageContent, PageHeader } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import CinnySVG from '$public/res/svg/cinny.svg';
import { clearCacheAndReload } from '$client/initMatrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { Method } from '$types/matrix-sdk';
import { useState } from 'react';

export function HomeserverInfo() {
  const mx = useMatrixClient();
  const [federationUrl, setFederationUrl] = useState<string>(mx.baseUrl);
  const [version, setVersion] = useState<any>(undefined);

  // By default assume the federationUrl is the same as the baseUrl.
  if (!version)
    mx.http
      .request(Method.Get, '/version', undefined, undefined, {
        prefix: '/_matrix/federation/v1',
        baseUrl: federationUrl,
      })
      .then((fetched_version) => setVersion(fetched_version))
      .catch((error) => {
        if (federationUrl === mx.baseUrl) {
          // Maybe they are *not* the same actually.
          mx.http
            .request(Method.Get, '/server', undefined, undefined, {
              prefix: '/.well-known/matrix',
              baseUrl: `https://${mx.getSafeUserId().split(':')[1]}`,
            })
            .then((well_known: any) => {
              const newUrl = `https://${well_known['m.server'].split(':')[0]}`;
              if (newUrl !== federationUrl) {
                setFederationUrl(newUrl);
              }
            })
            .catch((error2) => setVersion({ error: error2 }));
        } else {
          setVersion({ error });
        }
      });

  return (
    <Box direction="Column" gap="100" id="homeserver-info">
      <Text size="L400">Homeserver</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile title="Domain" description={mx.getSafeUserId().split(':')[1]} />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Base URL"
          description={
            <a href={mx.baseUrl} target="_blank" rel="noopener noreferrer">
              {mx.baseUrl}
            </a>
          }
        />
      </SequenceCard>
      {federationUrl !== mx.baseUrl && (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="Federation URL"
            description={
              <a href={federationUrl} target="_blank" rel="noopener noreferrer">
                {federationUrl}
              </a>
            }
          />
        </SequenceCard>
      )}
      {version ? (
        <>
          {version.error && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              {version.error.message}
            </SequenceCard>
          )}
          {version.server?.name && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile title="Name" description={version.server?.name} />
            </SequenceCard>
          )}
          {version.server?.version && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile title="Version" description={version.server?.version} />
            </SequenceCard>
          )}
          {version.server?.compiler && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile title="Compiler" description={version.server?.compiler} />
            </SequenceCard>
          )}
        </>
      ) : (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <Spinner />
        </SequenceCard>
      )}
    </Box>
  );
}

type AboutProps = {
  requestClose: () => void;
};
export function About({ requestClose }: AboutProps) {
  const mx = useMatrixClient();
  const devLabel = IS_RELEASE_TAG ? '' : '-dev';
  const buildLabel = BUILD_HASH ? ` (${BUILD_HASH})` : '';

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" gap="200">
          <Box grow="Yes" alignItems="Center" gap="200">
            <Text size="H3" truncate>
              About
            </Text>
          </Box>
          <Box shrink="No">
            <IconButton onClick={requestClose} variant="Surface">
              <Icon src={Icons.Cross} />
            </IconButton>
          </Box>
        </Box>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box gap="400">
                <Box shrink="No">
                  <img
                    style={{ width: toRem(60), height: toRem(60) }}
                    src={CinnySVG}
                    alt="Cinny logo"
                  />
                </Box>
                <Box direction="Column" gap="300">
                  <Box direction="Column" gap="100">
                    <Box gap="100" alignItems="End">
                      <Text size="H3">Sable</Text>
                      <Text size="T200">{`v${APP_VERSION}${devLabel}${buildLabel}`}</Text>
                    </Box>
                    <Text>Yet another matrix client fork(ed from cinny).</Text>
                  </Box>

                  <Box gap="200" wrap="Wrap">
                    <Button
                      as="a"
                      href="https://github.com/SableClient/Sable"
                      rel="noreferrer noopener"
                      target="_blank"
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.Code} size="100" filled />}
                    >
                      <Text size="B300">Source Code</Text>
                    </Button>
                    <Button
                      as="a"
                      href="https://github.com/SableClient/Sable/pulls"
                      rel="noreferrer noopener"
                      target="_blank"
                      variant="Critical"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={<Icon src={Icons.Heart} size="100" filled />}
                    >
                      <Text size="B300">Support</Text>
                    </Button>
                  </Box>
                </Box>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Options</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Clear Cache & Reload"
                    description="Clear all your locally stored data and reload from server."
                    after={
                      <Button
                        onClick={() => clearCacheAndReload(mx)}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">Clear Cache</Text>
                      </Button>
                    }
                  />
                </SequenceCard>
              </Box>
              <HomeserverInfo />
              <Box direction="Column" gap="100">
                <Text size="L400">Credits</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <Box
                    as="ul"
                    direction="Column"
                    gap="200"
                    style={{
                      margin: 0,
                      paddingLeft: config.space.S400,
                    }}
                  >
                    <li>
                      <Text size="T300">
                        {' '}
                        <a
                          href="https://github.com/cinnyapp/cinny"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          Cinny
                        </a>{' '}
                        is ©{' '}
                        <a
                          href="https://github.com/ajbura"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          Ajay Bura
                        </a>{' '}
                        used under the terms of{' '}
                        <a
                          href="https://github.com/cinnyapp/cinny/blob/dev/LICENSE"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          AGPL v3
                        </a>
                        .
                      </Text>
                    </li>
                    <li>
                      <Text size="T300">
                        The{' '}
                        <a
                          href="https://github.com/matrix-org/matrix-js-sdk"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          matrix-js-sdk
                        </a>{' '}
                        is ©{' '}
                        <a
                          href="https://matrix.org/foundation"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          The Matrix.org Foundation C.I.C
                        </a>{' '}
                        used under the terms of{' '}
                        <a
                          href="http://www.apache.org/licenses/LICENSE-2.0"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          Apache 2.0
                        </a>
                        .
                      </Text>
                    </li>
                    <li>
                      <Text size="T300">
                        The{' '}
                        <a
                          href="https://github.com/mozilla/twemoji-colr"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          twemoji-colr
                        </a>{' '}
                        font is ©{' '}
                        <a href="https://mozilla.org/" target="_blank" rel="noreferrer noopener">
                          Mozilla Foundation
                        </a>{' '}
                        used under the terms of{' '}
                        <a
                          href="http://www.apache.org/licenses/LICENSE-2.0"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Apache 2.0
                        </a>
                        .
                      </Text>
                    </li>
                    <li>
                      <Text size="T300">
                        The{' '}
                        <a
                          href="https://twemoji.twitter.com"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Twemoji
                        </a>{' '}
                        emoji art is ©{' '}
                        <a
                          href="https://twemoji.twitter.com"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Twitter, Inc and other contributors
                        </a>{' '}
                        used under the terms of{' '}
                        <a
                          href="https://creativecommons.org/licenses/by/4.0/"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          CC-BY 4.0
                        </a>
                        .
                      </Text>
                    </li>
                    <li>
                      <Text size="T300">
                        The{' '}
                        <a
                          href="https://material.io/design/sound/sound-resources.html"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Material sound resources
                        </a>{' '}
                        are ©{' '}
                        <a href="https://google.com" target="_blank" rel="noreferrer noopener">
                          Google
                        </a>{' '}
                        used under the terms of{' '}
                        <a
                          href="https://creativecommons.org/licenses/by/4.0/"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          CC-BY 4.0
                        </a>
                        .
                      </Text>
                    </li>
                  </Box>
                </SequenceCard>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}
