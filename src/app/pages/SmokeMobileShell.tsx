import { useEffect, useState } from 'react';
import { Box, Button, Header, IconButton, Menu, MenuItem, Text, config } from 'folds';
import { useParams } from 'react-router-dom';
import { Modal500 } from '$components/Modal500';
import { Page, PageNav, PageNavContent, PageRoot } from '$components/page';
import { CustomEditor, plainToEditorInput, useEditor } from '$components/editor';
import {
  ClockCounterClockwise,
  Smiley,
  composerIcon,
  GearSix,
  User,
  X,
} from '$components/icons/phosphor';
import { SettingMenuSelector, type SettingMenuOption } from '$components/setting-menu-selector';
import { EmojiGroupId, emojis } from '$plugins/emoji';
import { scaleSystemEmoji } from '$plugins/react-custom-html-parser';
import { MessageTextBody } from '$components/message/layout/Base';
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
import * as roomNavCss from '$features/room-nav/styles.css';
import { APP_FEATURES_URL, APP_SOURCE_URL, APP_SUPPORT_URL } from '$app/config/brand';
import { getMessageSearchShortcutPath } from '$features/search/searchShortcut';

const svgDataUri = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const smokeCustomEmojiA = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="30" fill="#6cdbdf" />
    <circle cx="24" cy="27" r="5" fill="#111827" />
    <path d="M22 41c3 4 15 4 20 0" stroke="#111827" stroke-width="5" stroke-linecap="round" fill="none" />
  </svg>
`);

const smokeCustomEmojiB = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="30" fill="#7c6ce5" />
    <circle cx="24" cy="26" r="5" fill="#111827" />
    <circle cx="40" cy="26" r="5" fill="#111827" />
    <path d="M21 42c6-5 16-5 22 0" stroke="#111827" stroke-width="5" stroke-linecap="round" fill="none" />
  </svg>
`);

const smokeStickerWide = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">
    <rect width="96" height="64" rx="12" fill="#111827" />
    <circle cx="22" cy="20" r="8" fill="#facc15" />
    <circle cx="74" cy="20" r="8" fill="#facc15" />
    <path d="M22 46h52" stroke="#f9fafb" stroke-width="10" stroke-linecap="round" />
  </svg>
`);

const smokeStickerTall = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96">
    <rect width="64" height="96" rx="12" fill="#1f2937" />
    <path d="M16 20h32v18H16z" fill="#60a5fa" />
    <circle cx="32" cy="58" r="14" fill="#c4b5fd" />
    <path d="M22 78h20" stroke="#f9fafb" stroke-width="8" stroke-linecap="round" />
  </svg>
`);

const smokeStickerSquare = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
    <rect width="72" height="72" rx="14" fill="#f59e0b" />
    <circle cx="24" cy="28" r="7" fill="#111827" />
    <circle cx="48" cy="28" r="7" fill="#111827" />
    <path d="M20 49c6 5 26 5 32 0" stroke="#111827" stroke-width="7" stroke-linecap="round" fill="none" />
  </svg>
`);

function SmokeCustomEmojiButton({
  src,
  label,
  testId,
}: {
  src: string;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={emojiBoardCss.EmojiItem}
      aria-label={label}
      data-testid={testId}
    >
      <img className={emojiBoardCss.CustomEmojiImg} alt="" src={src} />
    </button>
  );
}

function SmokeStickerButton({
  src,
  label,
  testId,
}: {
  src: string;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={emojiBoardCss.StickerItem}
      aria-label={label}
      data-testid={testId}
    >
      <img className={emojiBoardCss.StickerImg} alt="" src={src} />
    </button>
  );
}

function SmokeComposerEmojiAlignment() {
  const editor = useEditor();

  useEffect(() => {
    editor.children = plainToEditorInput('✅ 🫩');
    editor.onChange();
  }, [editor]);

  return (
    <Box
      data-testid="smoke-editor-composer"
      direction="Column"
      gap="200"
      style={{ width: '100%', maxWidth: 420 }}
    >
      <Text size="T300">Composer emoji baseline</Text>
      <CustomEditor editableName="SmokeComposer" editor={editor} readOnly />
    </Box>
  );
}

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
          <MessageTextBody jumboEmoji="normal" data-testid="smoke-jumbo-emoji-line">
            {scaleSystemEmoji('❤️')}
          </MessageTextBody>
          <Box
            data-testid="smoke-emoji-inline-line"
            alignItems="Center"
            gap="200"
            style={{ flexWrap: 'wrap', lineHeight: 1.35 }}
          >
            <Text size="T300">Inline:</Text>
            <Text size="T300">{scaleSystemEmoji('Status checks ✅ 😮 🫩 👍🏽')}</Text>
          </Box>
          <Text size="T300" data-testid="smoke-emoji-baseline-line">
            <span data-testid="smoke-emoji-baseline-text">Baseline check</span>{' '}
            {scaleSystemEmoji('🫩 ✅ 😮')}
          </Text>
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
          <Box
            data-testid="smoke-compact-preview-block"
            direction="Column"
            gap="100"
            style={{ width: '100%', maxWidth: 260 }}
          >
            <Text size="T300">Compact preview</Text>
            <Text
              data-testid="smoke-compact-preview-line"
              className={roomNavCss.MessagePreview}
              truncate
              size="T200"
              priority="300"
            >
              <b>Alice:</b> {scaleSystemEmoji('Status checks ✅ 😮 🫩 👍🏽')}
            </Text>
          </Box>
          <SmokeComposerEmojiAlignment />
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
          <Box data-testid="smoke-picker-scale-reference" gap="100" alignItems="Center">
            <button
              type="button"
              className={emojiBoardCss.EmojiItem}
              aria-label="Smoke standard emoji"
              data-testid="smoke-standard-emoji-button"
            >
              <span className={emojiBoardCss.EmojiGlyph} data-testid="smoke-standard-emoji-glyph">
                🫩
              </span>
            </button>
            <SmokeCustomEmojiButton
              src={smokeCustomEmojiA}
              label="Smoke custom emoji scale reference"
              testId="smoke-pack-icon-reference"
            />
          </Box>
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
                <EmojiGroup id="sable" label="Sable">
                  <SmokeCustomEmojiButton
                    src={smokeCustomEmojiA}
                    label="Smoke custom emoji aqua"
                    testId="smoke-pack-icon-a"
                  />
                  <SmokeCustomEmojiButton
                    src={smokeCustomEmojiB}
                    label="Smoke custom emoji violet"
                    testId="smoke-pack-icon-b"
                  />
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
          <Text size="H4">Sticker tile fit</Text>
          <Box data-testid="smoke-sticker-grid" wrap="Wrap" gap="100">
            <SmokeStickerButton
              src={smokeStickerWide}
              label="Smoke sticker wide"
              testId="smoke-sticker-a"
            />
            <SmokeStickerButton
              src={smokeStickerTall}
              label="Smoke sticker tall"
              testId="smoke-sticker-b"
            />
            <SmokeStickerButton
              src={smokeStickerSquare}
              label="Smoke sticker square"
              testId="smoke-sticker-c"
            />
            <SmokeStickerButton src={smokeStickerWide} label="Smoke sticker wide duplicate" />
            <SmokeStickerButton src={smokeStickerTall} label="Smoke sticker tall duplicate" />
            <SmokeStickerButton src={smokeStickerSquare} label="Smoke sticker square duplicate" />
          </Box>
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

const smokeNotificationOptions: SettingMenuOption<'default' | 'all' | 'mute'>[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Follows your global notification rules',
  },
  {
    value: 'all',
    label: 'All Messages',
    description: 'Alert for every new message in the room',
  },
  {
    value: 'mute',
    label: 'Mute',
    description: 'Hide unread noise until you open the room',
  },
];

function SmokeMenuPolish() {
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
          <Text size="H4">Notification selector chrome</Text>
          <Box data-testid="smoke-menu-selector">
            <SettingMenuSelector
              value="default"
              options={smokeNotificationOptions}
              onSelect={() => undefined}
            />
          </Box>
        </Box>

        <Box
          direction="Column"
          gap="200"
          style={{
            padding: config.space.S400,
            borderRadius: config.radii.R400,
            backgroundColor: 'var(--sable-surface-container)',
          }}
        >
          <Text size="H4">Account switcher grouping</Text>
          <Menu
            data-testid="smoke-account-menu"
            style={{ minWidth: 256, padding: config.space.S100 }}
          >
            <Box direction="Column" gap="100">
              <Text size="L400" priority="300" style={{ padding: '2px 8px' }}>
                Accounts
              </Text>
              <Box
                direction="Column"
                gap="100"
                style={{
                  padding: config.space.S100,
                  borderRadius: config.radii.R400,
                  backgroundColor: 'var(--sable-surface-container)',
                }}
              >
                <MenuItem size="300" radii="300">
                  <Text size="T300">evie@cloudhub.social</Text>
                </MenuItem>
                <MenuItem size="300" radii="300">
                  <Text size="T300">smoke@smoke.test</Text>
                </MenuItem>
              </Box>
              <Text size="L400" priority="300" style={{ padding: '2px 8px' }}>
                Status
              </Text>
              <Box
                direction="Column"
                gap="100"
                style={{
                  padding: config.space.S100,
                  borderRadius: config.radii.R400,
                  backgroundColor: 'var(--sable-surface-container)',
                }}
              >
                <MenuItem size="300" radii="300" aria-selected>
                  <Text size="T300">Online</Text>
                </MenuItem>
                <MenuItem size="300" radii="300">
                  <Text size="T300">Do Not Disturb</Text>
                </MenuItem>
              </Box>
            </Box>
          </Menu>
        </Box>

        <Box
          direction="Column"
          gap="200"
          style={{
            padding: config.space.S400,
            borderRadius: config.radii.R400,
            backgroundColor: 'var(--sable-surface-container)',
          }}
        >
          <Text size="H4">Welcome links</Text>
          <Box gap="200" wrap="Wrap">
            <Button as="a" href={APP_SOURCE_URL}>
              <Text size="B300">Source Code</Text>
            </Button>
            <Button as="a" href={APP_SUPPORT_URL}>
              <Text size="B300">Support</Text>
            </Button>
            <Button as="a" href={APP_FEATURES_URL} data-testid="smoke-features-link">
              <Text size="B300">Features</Text>
            </Button>
          </Box>
        </Box>
      </Box>
    </Page>
  );
}

type SmokeSearchContext = {
  label: string;
  pathname: string;
  selectedSpaceId?: string;
  currentRoomId?: string;
};

type SmokeSearchContextKey = 'room' | 'direct' | 'space';

const smokeSearchContexts: Record<SmokeSearchContextKey, SmokeSearchContext> = {
  room: {
    label: 'Home room',
    pathname: '/home/%21room%3Asmoke.test/',
    currentRoomId: '!room:smoke.test',
  },
  direct: {
    label: 'Direct room',
    pathname: '/direct/%21dm%3Asmoke.test/',
    currentRoomId: '!dm:smoke.test',
  },
  space: {
    label: 'Space lobby',
    pathname: '/%21space%3Asmoke.test/lobby/',
    selectedSpaceId: '!space:smoke.test',
  },
};
const smokeSearchContextKeys: SmokeSearchContextKey[] = ['room', 'direct', 'space'];

function SmokeSearchShortcuts() {
  const [contextKey, setContextKey] = useState<SmokeSearchContextKey>('room');
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [result, setResult] = useState('Idle');
  const context = smokeSearchContexts[contextKey];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setRoomPickerOpen(true);
        setResult('Opened room picker');
        return;
      }

      if (event.key.toLowerCase() !== 'f') return;

      const nextPath = getMessageSearchShortcutPath(context);
      if (!nextPath) return;

      event.preventDefault();
      setRoomPickerOpen(false);
      setResult(nextPath);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [context]);

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
          <Text size="H4">Search shortcut remap</Text>
          <Text size="T300">
            Press Ctrl/Cmd+F to route into context message search, or Ctrl/Cmd+K to open the room
            picker.
          </Text>
          <Box gap="200" wrap="Wrap">
            {smokeSearchContextKeys.map((key) => (
              <Button
                key={key}
                variant={contextKey === key ? 'Primary' : 'Secondary'}
                onClick={() => {
                  setContextKey(key);
                  setRoomPickerOpen(false);
                  setResult('Idle');
                }}
              >
                <Text size="B300">{smokeSearchContexts[key].label}</Text>
              </Button>
            ))}
          </Box>
        </Box>

        <Box
          direction="Column"
          gap="200"
          style={{
            padding: config.space.S400,
            borderRadius: config.radii.R400,
            backgroundColor: 'var(--sable-surface-container)',
          }}
        >
          <Text size="L400">Active context</Text>
          <Text size="T300" data-testid="smoke-search-context">
            {context.label}
          </Text>
          <Text size="T300" data-testid="smoke-search-pathname">
            {context.pathname}
          </Text>
          <Text size="T300" data-testid="smoke-search-result">
            {result}
          </Text>
          <Text size="T300" data-testid="smoke-room-picker-state">
            {roomPickerOpen ? 'Room picker open' : 'Room picker closed'}
          </Text>
        </Box>
      </Box>
    </Page>
  );
}

export function SmokeMobileShell() {
  const { mode = 'home' } = useParams();

  if (mode === 'emoji-polish') return <SmokeEmojiPolish />;
  if (mode === 'menu-polish') return <SmokeMenuPolish />;
  if (mode === 'search-shortcuts') return <SmokeSearchShortcuts />;
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
