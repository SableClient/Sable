import { useState } from 'react';
import { Box, Text, Scroll, Button, config, toRem, Spinner } from 'folds';
import { Code, Heart, menuIcon } from '$components/icons/phosphor';
import { PageContent } from '$components/page';
import { SequenceCard } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import LogoSVG from '$public/res/svg/logo.svg';
import {
  APP_ATTRIBUTION,
  APP_DESCRIPTION,
  APP_NAME,
  APP_SOURCE_URL,
  APP_SUPPORT_URL,
  APP_UPSTREAM_URL,
} from '$app/config/brand';
import { clearCacheAndReload } from '$client/initMatrix';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { SequenceCardStyle } from '$features/settings/styles.css';
import { Method } from '$types/matrix-sdk';
import { useOpenBugReportModal } from '$state/hooks/bugReportModal';
import { SettingsSectionPage } from '$features/settings/SettingsSectionPage';

type VersionResult =
  | { error: { message: string } }
  | { server: { name?: string; version?: string; compiler?: string } }
  | undefined;

export function HomeserverInfo() {
  const mx = useMatrixClient();
  const [federationUrl, setFederationUrl] = useState<string>(mx.baseUrl);
  const [version, setVersion] = useState<VersionResult>(undefined);

  if (!version) {
    // Step 1: Fetch well-known first to discover federation server
    const userDomain = mx.getSafeUserId().split(':')[1];
    mx.http
      .request(Method.Get, '/server', undefined, undefined, {
        prefix: '/.well-known/matrix',
        baseUrl: `https://${userDomain}`,
      })
      .then((well_known) => {
        // Step 2: Parse m.server from well-known response
        const mServer = (well_known as { 'm.server'?: string })['m.server'];
        // Extract host from m.server (format: "host:port" or "host")
        const federationBase = mServer
          ? `https://${mServer.split(':')[0]}${mServer.includes(':') ? `:${mServer.split(':')[1]}` : ''}`
          : `https://${userDomain}:8448`; // Fallback to port 8448 if well-known not found

        setFederationUrl(federationBase);

        // Step 3: Fetch federation version from discovered endpoint
        return mx.http.request(Method.Get, '/version', undefined, undefined, {
          prefix: '/_matrix/federation/v1',
          baseUrl: federationBase,
        });
      })
      .then((fetched_version) =>
        setVersion({
          server: fetched_version as { name?: string; version?: string; compiler?: string },
        })
      )
      .catch((error) => {
        // Federation may not be exposed to clients — treat as optional
        setVersion({ error: { message: String(error) } });
      });
  }

  return (
    <Box direction="Column" gap="100" id="homeserver-info">
      <Text size="L400">Homeserver</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Domain"
          focusId="domain"
          description={mx.getSafeUserId().split(':')[1]}
        />
      </SequenceCard>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Base URL"
          focusId="base-url"
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
            focusId="federation-url"
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
          {'error' in version && version.error && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              {version.error.message}
            </SequenceCard>
          )}
          {'server' in version && version.server?.name && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile
                title="Name"
                focusId="homeserver-name"
                description={version.server?.name}
              />
            </SequenceCard>
          )}
          {'server' in version && version.server?.version && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile
                title="Version"
                focusId="homeserver-version"
                description={version.server?.version}
              />
            </SequenceCard>
          )}
          {'server' in version && version.server?.compiler && (
            <SequenceCard
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile
                title="Compiler"
                focusId="homeserver-compiler"
                description={version.server?.compiler}
              />
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
  requestBack?: () => void;
  requestClose: () => void;
};
export function About({ requestBack, requestClose }: Readonly<AboutProps>) {
  const mx = useMatrixClient();
  const devLabel = IS_RELEASE_TAG ? '' : '-dev';
  const buildLabel = BUILD_HASH ? ` (${BUILD_HASH})` : '';
  const openBugReport = useOpenBugReportModal();

  return (
    <SettingsSectionPage title="About" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box gap="400">
                <Box shrink="No">
                  <img
                    style={{ width: toRem(60), height: toRem(60) }}
                    src={LogoSVG}
                    alt={`${APP_NAME} logo`}
                  />
                </Box>
                <Box direction="Column" gap="300">
                  <Box direction="Column" gap="100">
                    <Box gap="100" alignItems="End">
                      <Text size="H3">{APP_NAME}</Text>
                      <Text size="T200">{`v${APP_VERSION}${devLabel}${buildLabel}`}</Text>
                    </Box>
                    <Text>{APP_DESCRIPTION}</Text>
                    <Text priority="300">{APP_ATTRIBUTION}</Text>
                  </Box>

                  <Box gap="200" wrap="Wrap">
                    <Button
                      as="a"
                      href={APP_SOURCE_URL}
                      rel="noreferrer noopener"
                      target="_blank"
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={menuIcon(Code, { weight: 'fill' })}
                    >
                      <Text size="B300">Source Code</Text>
                    </Button>
                    <Button
                      as="a"
                      href={APP_UPSTREAM_URL}
                      rel="noreferrer noopener"
                      target="_blank"
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={menuIcon(Code, { weight: 'fill' })}
                    >
                      <Text size="B300">Upstream</Text>
                    </Button>
                    <Button
                      as="a"
                      href={APP_SUPPORT_URL}
                      rel="noreferrer noopener"
                      target="_blank"
                      variant="Critical"
                      fill="Soft"
                      size="300"
                      radii="300"
                      before={menuIcon(Heart, { weight: 'fill' })}
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
                    focusId="clear-cache-and-reload"
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
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Report an Issue"
                    focusId="report-an-issue"
                    description="Report a bug or request a feature on GitHub."
                    after={
                      <Button
                        onClick={openBugReport}
                        variant="Secondary"
                        fill="Soft"
                        size="300"
                        radii="300"
                        outlined
                      >
                        <Text size="B300">Report</Text>
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
                        <a
                          href="https://github.com/cinnyapp/cinny"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          Cinny
                        </a>
                        {', © '}
                        <a
                          href="https://github.com/ajbura"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          Ajay Bura
                        </a>
                        {', is used under the terms of '}
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
                        {'The '}
                        <a
                          href="https://github.com/matrix-org/matrix-js-sdk"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          matrix-js-sdk
                        </a>
                        {', © '}
                        <a
                          href="https://matrix.org/foundation"
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          The Matrix.org Foundation C.I.C
                        </a>
                        {', is used under the terms of '}
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
                        {'The '}
                        <a
                          href="https://github.com/mozilla/twemoji-colr"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          twemoji-colr
                        </a>
                        {' font, © '}
                        <a href="https://mozilla.org/" target="_blank" rel="noreferrer noopener">
                          Mozilla Foundation
                        </a>
                        {', is used under the terms of '}
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
                        {'The '}
                        <a
                          href="https://github.com/twitter/twemoji"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Twemoji
                        </a>
                        {' emoji art, © '}
                        <a
                          href="https://github.com/twitter/twemoji"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Twitter, Inc and other contributors
                        </a>
                        {', is used under the terms of '}
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
                        {'The '}
                        <a
                          href="https://material.io/design/sound/sound-resources.html"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Material sound resources
                        </a>{' '}
                        {', © '}
                        <a href="https://google.com" target="_blank" rel="noreferrer noopener">
                          Google
                        </a>
                        {', are used under the terms of '}
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
    </SettingsSectionPage>
  );
}
