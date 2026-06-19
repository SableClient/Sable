import { Box, Header, IconButton, MenuItem, Text, config } from 'folds';
import { useParams } from 'react-router-dom';
import { Modal500 } from '$components/Modal500';
import { Page, PageNav, PageNavContent, PageRoot } from '$components/page';
import {
  ClockCounterClockwise,
  Smiley,
  composerIcon,
  GearSix,
  User,
  X,
} from '$components/icons/phosphor';
import { EmojiGroupId, emojis } from '$plugins/emoji';
import { scaleSystemEmoji } from '$plugins/react-custom-html-parser';
import {
  EmojiBoardLayout,
  EmojiGroup,
  EmojiItem,
  GroupIcon,
  Sidebar,
  SidebarDivider,
  SidebarStack,
} from '$components/emoji-board/components';
import * as emojiBoardCss from '$components/emoji-board/components/styles.css';

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

function SmokeRoomSpacing() {
  return (
    <Page>
      <Box grow="Yes" style={{ minHeight: 0 }}>
        <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
          <Box
            grow="Yes"
            direction="Column"
            gap="300"
            style={{
              minHeight: 0,
              paddingTop: config.space.S600,
              paddingLeft: config.space.S200,
              paddingRight: config.space.S400,
              paddingBottom: config.space.S700,
              backgroundColor: 'var(--sable-surface)',
            }}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <Box
                key={index}
                data-testid={index === 4 ? 'smoke-last-event' : undefined}
                style={{
                  alignSelf: index % 2 === 0 ? 'stretch' : 'flex-start',
                  width: index % 2 === 0 ? '100%' : 'max-content',
                  maxWidth: '100%',
                  padding: config.space.S300,
                  borderRadius: config.radii.R400,
                  backgroundColor:
                    index === 4
                      ? 'var(--sable-surface-container-high)'
                      : 'var(--sable-surface-container)',
                }}
              >
                <Text size="T300">
                  {index === 4
                    ? 'Last visible timeline event should keep breathing room above typing and composer.'
                    : `Timeline event ${index + 1}`}
                </Text>
              </Box>
            ))}
          </Box>
          <Box
            data-testid="smoke-typing-indicator"
            alignItems="Center"
            style={{
              minHeight: '28px',
              padding: `0 ${config.space.S500}`,
              backgroundColor: 'var(--sable-surface-container)',
              borderTop: '1px solid var(--sable-border-subtle)',
            }}
          >
            <Text size="T300">Someone is typing...</Text>
          </Box>
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
                data-testid="smoke-composer"
                direction="Column"
                gap="200"
                style={{
                  padding: `${config.space.S300} 0`,
                }}
              >
                <Box
                  style={{
                    padding: config.space.S300,
                    borderRadius: config.radii.R400,
                    backgroundColor: 'var(--sable-surface)',
                  }}
                >
                  <Text size="T300">Composer</Text>
                </Box>
              </Box>
            </div>
          </Box>
        </Box>
        <Box
          data-testid="smoke-drawer-divider"
          style={{
            width: '1px',
            backgroundColor: 'var(--sable-border-subtle)',
          }}
        />
        <Box
          data-testid="smoke-drawer"
          shrink="No"
          direction="Column"
          gap="200"
          style={{
            width: '320px',
            padding: config.space.S400,
            backgroundColor: 'var(--sable-surface-container)',
          }}
        >
          <Text size="H4">Members</Text>
          <MenuItem variant="Background" radii="400">
            <Text size="T300">Drawer content</Text>
          </MenuItem>
        </Box>
      </Box>
    </Page>
  );
}

function SmokeEmojiPolish() {
  const peopleEmoji = emojis.filter((emoji) => emoji.group === 0 || emoji.group === 1).slice(0, 12);
  const natureEmoji = emojis.filter((emoji) => emoji.group === 3).slice(0, 12);

  return (
    <Page>
      <Box
        grow="Yes"
        direction="Column"
        gap="400"
        style={{
          minHeight: 0,
          padding: config.space.S400,
          backgroundColor: 'var(--sable-surface)',
        }}
      >
        <Box
          direction="Column"
          gap="200"
          style={{
            padding: config.space.S400,
            borderRadius: config.radii.R400,
            backgroundColor: 'var(--sable-surface-container)',
          }}
        >
          <Text size="H4">Timeline emoji scaling</Text>
          <Box
            data-testid="smoke-emoji-inline-line"
            alignItems="Center"
            gap="200"
            style={{ flexWrap: 'wrap', lineHeight: 1.35 }}
          >
            <Text size="T300">Inline:</Text>
            <Text size="T300">{scaleSystemEmoji('Status checks ✅ 😮 🫩 👍🏽')}</Text>
          </Box>
          <Box
            data-testid="smoke-emoji-fixed-cell-line"
            alignItems="Center"
            gap="200"
            style={{ flexWrap: 'wrap', lineHeight: 1.35 }}
          >
            <Text size="T300">Fixed-cell:</Text>
            <Text size="T300">{scaleSystemEmoji('Wordle ⬛🟨🟩 should stay evenly spaced')}</Text>
          </Box>
          <Box
            data-testid="smoke-emoji-stacked-lines"
            direction="Column"
            gap="100"
            style={{ lineHeight: 1.35 }}
          >
            <Text size="T300">{scaleSystemEmoji('Reaction row 😀 😃 😄 😁 😆')}</Text>
            <Text size="T300">
              {scaleSystemEmoji('The next line should not collide with the emoji baseline.')}
            </Text>
          </Box>
        </Box>

        <Box
          direction="Column"
          gap="200"
          style={{
            minHeight: 0,
            padding: config.space.S400,
            borderRadius: config.radii.R400,
            backgroundColor: 'var(--sable-surface-container)',
          }}
        >
          <Text size="H4">Emoji picker chrome</Text>
          <div data-testid="smoke-emoji-picker">
            <EmojiBoardLayout
              header={
                <Box direction="Column" gap="200">
                  <Box
                    style={{
                      padding: config.space.S300,
                      borderRadius: config.radii.R400,
                      backgroundColor: 'var(--sable-surface)',
                    }}
                  >
                    <Text size="T300">Search emoji</Text>
                  </Box>
                </Box>
              }
              sidebar={
                <Sidebar>
                  <SidebarStack>
                    <GroupIcon
                      active
                      id="recent"
                      label="Recent"
                      icon={ClockCounterClockwise}
                      onClick={() => undefined}
                    />
                  </SidebarStack>
                  <SidebarStack>
                    <SidebarDivider />
                    <GroupIcon
                      active={false}
                      id={EmojiGroupId.People}
                      label="Smileys & People"
                      icon={Smiley}
                      onClick={() => undefined}
                    />
                    <GroupIcon
                      active={false}
                      id={EmojiGroupId.Nature}
                      label="Animals & Nature"
                      icon={GearSix}
                      onClick={() => undefined}
                    />
                  </SidebarStack>
                </Sidebar>
              }
            >
              <Box grow="Yes" direction="Column" style={{ minHeight: 0 }}>
                <EmojiGroup id="recent" label="Recent">
                  {peopleEmoji.slice(0, 6).map((emoji) => (
                    <EmojiItem key={`recent-${emoji.hexcode}`} emoji={emoji} />
                  ))}
                </EmojiGroup>
                <EmojiGroup id={EmojiGroupId.People} label="Smileys & People">
                  {peopleEmoji.map((emoji) => (
                    <EmojiItem key={emoji.hexcode} emoji={emoji} />
                  ))}
                </EmojiGroup>
                <EmojiGroup id={EmojiGroupId.Nature} label="Animals & Nature">
                  {natureEmoji.map((emoji) => (
                    <EmojiItem key={emoji.hexcode} emoji={emoji} />
                  ))}
                </EmojiGroup>
              </Box>
              <Box
                shrink="No"
                className={emojiBoardCss.Preview}
                gap="300"
                alignItems="Center"
                style={{ marginTop: config.space.S300 }}
              >
                <Box
                  display="InlineFlex"
                  className={emojiBoardCss.PreviewEmoji}
                  alignItems="Center"
                  justifyContent="Center"
                >
                  🫩
                </Box>
                <Text size="H5" truncate>
                  :face_holding_back_tears:
                </Text>
              </Box>
            </EmojiBoardLayout>
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

  if (mode === 'emoji-polish') return <SmokeEmojiPolish />;
  if (mode === 'settings') return <SmokeSettingsModal />;
  if (mode === 'profile') return <SmokeProfileModal />;
  if (mode === 'room') return <SmokeRoomFooter />;
  if (mode === 'room-spacing') return <SmokeRoomSpacing />;

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
