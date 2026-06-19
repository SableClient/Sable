import { Box, Header, IconButton, MenuItem, Text, config } from 'folds';
import { useParams } from 'react-router-dom';
import { Modal500 } from '$components/Modal500';
import { Page, PageNav, PageNavContent, PageRoot } from '$components/page';
import { composerIcon, GearSix, User, X } from '$components/icons/phosphor';

function SmokeHomeNav() {
  return (
    <PageNav>
      <Header size="600" variant="Background">
        <Text size="H4">Direct Messages</Text>
      </Header>
      <PageNavContent>
        <Box direction="Column" gap="200">
          {Array.from({ length: 10 }, (_, index) => (
            <MenuItem key={index} variant="Background" radii="400">
              <Text size="T300">Conversation {index + 1}</Text>
            </MenuItem>
          ))}
          <MenuItem variant="Background" radii="400" aria-pressed>
            <Text size="T300">Last item above safe area</Text>
          </MenuItem>
        </Box>
      </PageNavContent>
    </PageNav>
  );
}

function SmokeRoomFooter() {
  return (
    <Page>
      <Box grow="Yes" direction="Column" justifyContent="End">
        <Box
          shrink="No"
          direction="Column"
          style={{
            backgroundColor: 'var(--sable-surface-container)',
            paddingBottom: 'var(--sable-safe-area-bottom, 0px)',
          }}
        >
          <div style={{ padding: `0 ${config.space.S400}` }}>
            <Box
              direction="Column"
              gap="200"
              style={{
                padding: `${config.space.S300} 0`,
              }}
            >
              <Text size="T300">Composer safe-area sample</Text>
              <Box
                style={{
                  padding: config.space.S300,
                  borderRadius: config.radii.R400,
                  backgroundColor: 'var(--sable-surface)',
                }}
              >
                <Text size="T300">Following the conversation</Text>
              </Box>
            </Box>
          </div>
        </Box>
      </Box>
    </Page>
  );
}

function SmokeSettingsModal() {
  return (
    <Modal500 requestClose={() => undefined} fullScreenOnMobile>
      <Box direction="Column" style={{ height: '100%', minHeight: 0 }}>
        <Header size="600" variant="Background">
          <Box grow="Yes" alignItems="Center" justifyContent="SpaceBetween">
            <Text size="H4">Room Settings</Text>
            <IconButton variant="Background">{composerIcon(X)}</IconButton>
          </Box>
        </Header>
        <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
          <PageNavContent>
            <Box direction="Column" gap="100">
              <MenuItem before={composerIcon(GearSix)} variant="Background" radii="400">
                <Text size="T300">General</Text>
              </MenuItem>
              <MenuItem before={composerIcon(User)} variant="Background" radii="400" aria-pressed>
                <Text size="T300">Members</Text>
              </MenuItem>
              <MenuItem before={composerIcon(GearSix)} variant="Background" radii="400">
                <Text size="T300">Permissions</Text>
              </MenuItem>
              <MenuItem before={composerIcon(GearSix)} variant="Background" radii="400">
                <Text size="T300">Developer Tools</Text>
              </MenuItem>
            </Box>
          </PageNavContent>
        </Box>
      </Box>
    </Modal500>
  );
}

function SmokeProfileModal() {
  return (
    <Modal500 requestClose={() => undefined} fullScreenOnMobile>
      <Box direction="Column" style={{ height: '100%', minHeight: 0 }}>
        <Box
          shrink="No"
          alignItems="Center"
          justifyContent="SpaceBetween"
          style={{ padding: '12px 12px 8px' }}
        >
          <Text size="H4">Member Profile</Text>
          <IconButton variant="Background">{composerIcon(X)}</IconButton>
        </Box>
        <Box
          grow="Yes"
          direction="Column"
          style={{
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain',
          }}
        >
          <Box direction="Column" gap="300" style={{ padding: config.space.S300 }}>
            <Box
              direction="Column"
              gap="200"
              style={{
                padding: config.space.S300,
                borderRadius: config.radii.R400,
                backgroundColor: 'var(--sable-surface-container)',
              }}
            >
              <Text size="H3">Smoketest User</Text>
              <Text size="T300">@smoke:smoke.test</Text>
              <Text size="T300">
                This profile body is intentionally tall enough to exercise the mobile scroll
                container inside the full-screen presentation.
              </Text>
            </Box>
            {Array.from({ length: 6 }, (_, index) => (
              <Box
                key={index}
                style={{
                  padding: config.space.S300,
                  borderRadius: config.radii.R400,
                  backgroundColor: 'var(--sable-surface-container)',
                }}
              >
                <Text size="T300">Profile detail block {index + 1}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Modal500>
  );
}

export function SmokeMobileShell() {
  const { mode = 'home' } = useParams();

  if (mode === 'settings') return <SmokeSettingsModal />;
  if (mode === 'profile') return <SmokeProfileModal />;
  if (mode === 'room') return <SmokeRoomFooter />;

  return (
    <PageRoot nav={<SmokeHomeNav />}>
      <Page>
        <Box grow="Yes" alignItems="Center" justifyContent="Center">
          <Text size="T300">Smoke mobile shell content</Text>
        </Box>
      </Page>
    </PageRoot>
  );
}
