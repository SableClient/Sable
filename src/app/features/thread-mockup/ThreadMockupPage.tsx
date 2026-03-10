import { useState } from 'react';
import {
  Box,
  Chip,
  Header,
  Icon,
  IconButton,
  Icons,
  Line,
  Scroll,
  Text,
  config,
  toRem,
} from 'folds';
import { Page, PageHeader } from '$components/page';
import * as css from './thread-mockup.css';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type MockReply = {
  id: string;
  sender: string;
  senderColor: string;
  initial: string;
  body: string;
  time: string;
};

type MockMessage = {
  id: string;
  sender: string;
  senderColor: string;
  initial: string;
  body: string;
  time: string;
  threadCount?: number;
  threadPreview?: string;
  threadParticipants?: { initial: string; color: string }[];
};

const MESSAGES: MockMessage[] = [
  {
    id: 'msg1',
    sender: 'Alice',
    senderColor: '#a855f7',
    initial: 'A',
    body: 'Has anyone looked at the new design system yet?',
    time: '11:02 AM',
  },
  {
    id: 'msg2',
    sender: 'Bob',
    senderColor: '#3b82f6',
    initial: 'B',
    body: 'Yeah! I think we should move the navigation to the left sidebar. What does everyone think about that?',
    time: '11:05 AM',
    threadCount: 4,
    threadPreview: 'Carol: I agree, it makes more sense for larger screens',
    threadParticipants: [
      { initial: 'C', color: '#ec4899' },
      { initial: 'D', color: '#10b981' },
      { initial: 'A', color: '#a855f7' },
    ],
  },
  {
    id: 'msg3',
    sender: 'Carol',
    senderColor: '#ec4899',
    initial: 'C',
    body: 'I pushed the updated mockups to Figma, check them out when you get a chance 🎨',
    time: '11:22 AM',
  },
  {
    id: 'msg4',
    sender: 'Alice',
    senderColor: '#a855f7',
    initial: 'A',
    body: 'Looks great! One question — are we keeping the current colour palette or exploring new options?',
    time: '11:24 AM',
    threadCount: 2,
    threadPreview: 'Bob: I think we should try a few options first',
    threadParticipants: [{ initial: 'B', color: '#3b82f6' }],
  },
];

const REPLIES: Record<string, MockReply[]> = {
  msg2: [
    {
      id: 'r1',
      sender: 'Carol',
      senderColor: '#ec4899',
      initial: 'C',
      body: 'I agree, it makes more sense for larger screens',
      time: '11:08 AM',
    },
    {
      id: 'r2',
      sender: 'Dave',
      senderColor: '#10b981',
      initial: 'D',
      body: 'Could work on mobile too with a bottom sheet pattern',
      time: '11:10 AM',
    },
    {
      id: 'r3',
      sender: 'Alice',
      senderColor: '#a855f7',
      initial: 'A',
      body: 'Good point! Maybe collapsible by default on mobile?',
      time: '11:12 AM',
    },
    {
      id: 'r4',
      sender: 'Bob',
      senderColor: '#3b82f6',
      initial: 'B',
      body: 'Yes, and we can persist the open/closed state per session',
      time: '11:14 AM',
    },
  ],
  msg4: [
    {
      id: 'r5',
      sender: 'Bob',
      senderColor: '#3b82f6',
      initial: 'B',
      body: "I think we should try a few options first — let's create some variations",
      time: '11:26 AM',
    },
    {
      id: 'r6',
      sender: 'Carol',
      senderColor: '#ec4899',
      initial: 'C',
      body: "Agreed, let's make it fully themeable from the start",
      time: '11:31 AM',
    },
  ],
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type AvatarCircleProps = {
  initial: string;
  color: string;
  small?: boolean;
};

function AvatarCircle({ initial, color, small }: AvatarCircleProps) {
  return (
    <div
      className={small ? css.SmallAvatarCircle : css.AvatarCircle}
      style={{ backgroundColor: color }}
    >
      {initial}
    </div>
  );
}

type MockReplyItemProps = {
  reply: MockReply;
};

function MockReplyItem({ reply }: MockReplyItemProps) {
  return (
    <div className={css.InlineReplyRow}>
      <AvatarCircle initial={reply.initial} color={reply.senderColor} />
      <Box direction="Column" gap="100">
        <Box gap="200" alignItems="Center">
          <Text size="T300" style={{ color: reply.senderColor, fontWeight: 600 }}>
            {reply.sender}
          </Text>
          <Text size="T200" priority="300">
            {reply.time}
          </Text>
        </Box>
        <Text size="T400">{reply.body}</Text>
      </Box>
    </div>
  );
}

type ThreadChipProps = {
  message: MockMessage;
  onClick?: () => void;
  active?: boolean;
};

function ThreadCountChip({ message, onClick, active }: ThreadChipProps) {
  if (!message.threadCount) return null;
  return (
    <div className={css.ThreadChipRow}>
      <div style={{ display: 'flex', gap: toRem(2), marginRight: config.space.S100 }}>
        {message.threadParticipants?.map((p) => (
          <AvatarCircle key={p.initial} initial={p.initial} color={p.color} small />
        ))}
      </div>
      <Chip
        variant={active ? 'Primary' : 'SurfaceVariant'}
        size="400"
        onClick={onClick}
        before={<Icon size="100" src={Icons.ThreadReply} />}
      >
        <Text size="T200" style={{ fontWeight: active ? 700 : 500 }}>
          {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
        </Text>
      </Chip>
      {message.threadPreview && (
        <Text size="T200" priority="300" truncate style={{ maxWidth: toRem(220) }}>
          {message.threadPreview}
        </Text>
      )}
    </div>
  );
}

type MessageItemProps = {
  message: MockMessage;
  onOpenThread?: () => void;
  active?: boolean;
  showThreadChip?: boolean;
};

function MessageItem({ message, onOpenThread, active, showThreadChip = true }: MessageItemProps) {
  return (
    <Box direction="Column">
      <div className={css.MessageRow} data-active={active ? 'true' : undefined}>
        <AvatarCircle initial={message.initial} color={message.senderColor} />
        <Box direction="Column" gap="100" grow="Yes">
          <Box gap="200" alignItems="Center">
            <Text size="T300" style={{ color: message.senderColor, fontWeight: 600 }}>
              {message.sender}
            </Text>
            <Text size="T200" priority="300">
              {message.time}
            </Text>
          </Box>
          <Text size="T400">{message.body}</Text>
        </Box>
        {message.threadCount && (
          <IconButton
            size="300"
            variant="SurfaceVariant"
            onClick={onOpenThread}
            aria-label="Open thread"
            style={{ flexShrink: 0, alignSelf: 'flex-start' }}
          >
            <Icon size="200" src={Icons.Thread} />
          </IconButton>
        )}
      </div>
      {showThreadChip && message.threadCount && (
        <ThreadCountChip message={message} onClick={onOpenThread} active={active} />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Thread Panel (shared between Side Panel and Overlay variants)
// ---------------------------------------------------------------------------

type ThreadPanelProps = {
  messageId: string;
  onClose: () => void;
};

function ThreadPanelContents({ messageId, onClose }: ThreadPanelProps) {
  const rootMsg = MESSAGES.find((m) => m.id === messageId);
  const replies = REPLIES[messageId] ?? [];
  if (!rootMsg) return null;

  return (
    <>
      <Header className={css.ThreadPanelHeader} variant="Background" size="500">
        <Box grow="Yes" alignItems="Center" gap="200">
          <Icon size="200" src={Icons.Thread} />
          <Box grow="Yes">
            <Text size="T300" truncate>
              Thread
            </Text>
          </Box>
          <Text size="T200" priority="300">
            # general
          </Text>
          <IconButton size="300" onClick={onClose} aria-label="Close thread">
            <Icon size="200" src={Icons.Cross} />
          </IconButton>
        </Box>
      </Header>

      <Scroll className={css.ThreadPanelScroll} visibility="Hover">
        {/* Root message */}
        <div className={css.ThreadRootMsg}>
          <Box gap="300">
            <AvatarCircle initial={rootMsg.initial} color={rootMsg.senderColor} />
            <Box direction="Column" gap="100" grow="Yes">
              <Box gap="200" alignItems="Center">
                <Text size="T300" style={{ color: rootMsg.senderColor, fontWeight: 600 }}>
                  {rootMsg.sender}
                </Text>
                <Text size="T200" priority="300">
                  {rootMsg.time}
                </Text>
              </Box>
              <Text size="T400">{rootMsg.body}</Text>
            </Box>
          </Box>
        </div>

        {/* Reply count label */}
        <Box
          alignItems="Center"
          gap="200"
          style={{ padding: `${config.space.S100} ${config.space.S300}` }}
        >
          <Text size="T200" priority="300">
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </Text>
          <Line variant="Surface" style={{ flex: 1 }} />
        </Box>

        {/* Replies */}
        <Box direction="Column" style={{ padding: `0 ${config.space.S300} ${config.space.S300}` }}>
          {replies.map((reply) => (
            <MockReplyItem key={reply.id} reply={reply} />
          ))}
        </Box>
      </Scroll>

      {/* Thread input */}
      <div className={css.InputArea}>
        <Box gap="200" alignItems="Center">
          <AvatarCircle initial="Y" color="#6366f1" small />
          <div
            className={css.MockInput}
            style={{ borderColor: 'var(--mx-bg-surface-border, currentColor)', opacity: 0.6 }}
          >
            <Text size="T300" priority="300">
              Reply in thread…
            </Text>
          </div>
          <IconButton size="300" aria-label="Send">
            <Icon size="200" src={Icons.Send} />
          </IconButton>
        </Box>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Variant A: Side Panel
// ---------------------------------------------------------------------------

function SidePanelVariant() {
  const [openThread, setOpenThread] = useState<string>('msg2');

  return (
    <div className={css.ContentArea}>
      {/* Timeline */}
      <div className={css.Timeline}>
        <Scroll className={css.TimelineScroll} visibility="Hover">
          <Box direction="Column" style={{ padding: `${config.space.S400} 0` }}>
            {MESSAGES.map((msg) => (
              <Box direction="Column" key={msg.id}>
                <MessageItem
                  message={msg}
                  onOpenThread={() => setOpenThread(openThread === msg.id ? '' : msg.id)}
                  active={openThread === msg.id}
                />
              </Box>
            ))}
          </Box>
        </Scroll>

        {/* Room input */}
        <div
          className={css.InputArea}
          style={{ borderTopWidth: config.borderWidth.B300, borderTopStyle: 'solid' }}
        >
          <Box gap="200" alignItems="Center">
            <AvatarCircle initial="Y" color="#6366f1" small />
            <div
              className={css.MockInput}
              style={{ borderColor: 'var(--mx-bg-surface-border, currentColor)', opacity: 0.6 }}
            >
              <Text size="T300" priority="300">
                Message # general…
              </Text>
            </div>
            <IconButton size="300" aria-label="Send">
              <Icon size="200" src={Icons.Send} />
            </IconButton>
          </Box>
        </div>
      </div>

      {/* Thread panel */}
      {openThread && (
        <>
          <Line variant="Background" direction="Vertical" size="300" />
          <div className={css.ThreadPanel}>
            <ThreadPanelContents messageId={openThread} onClose={() => setOpenThread('')} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant B: Inline Replies
// ---------------------------------------------------------------------------

function InlineVariant() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ msg2: true });

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className={css.ContentArea}>
      <div className={css.Timeline}>
        <Scroll className={css.TimelineScroll} visibility="Hover">
          <Box direction="Column" style={{ padding: `${config.space.S400} 0` }}>
            {MESSAGES.map((msg) => (
              <Box direction="Column" key={msg.id}>
                {/* Message row (no chip, controls handled inline) */}
                <MessageItem message={msg} showThreadChip={false} />

                {/* Inline expand/collapse */}
                {msg.threadCount && (
                  <div style={{ paddingLeft: toRem(80), paddingBottom: config.space.S100 }}>
                    <Chip
                      variant="SurfaceVariant"
                      size="400"
                      onClick={() => toggle(msg.id)}
                      before={
                        <Icon
                          size="100"
                          src={expanded[msg.id] ? Icons.ChevronBottom : Icons.ChevronRight}
                        />
                      }
                    >
                      <Text size="T200">
                        {expanded[msg.id] ? 'Collapse' : `Show ${msg.threadCount} replies`}
                        {!expanded[msg.id] && msg.threadPreview && (
                          <Text
                            as="span"
                            size="T200"
                            priority="300"
                            style={{ marginLeft: config.space.S100 }}
                          >
                            — {msg.threadPreview}
                          </Text>
                        )}
                      </Text>
                    </Chip>
                  </div>
                )}

                {/* Expanded inline replies */}
                {msg.threadCount && expanded[msg.id] && (
                  <div
                    className={css.InlineThreadContainer}
                    style={{ borderLeftColor: msg.senderColor }}
                  >
                    <Box direction="Column" style={{ padding: `${config.space.S100} 0` }}>
                      {(REPLIES[msg.id] ?? []).map((reply) => (
                        <MockReplyItem key={reply.id} reply={reply} />
                      ))}
                    </Box>
                    {/* Inline reply input */}
                    <Box gap="200" alignItems="Center" style={{ paddingBottom: config.space.S200 }}>
                      <AvatarCircle initial="Y" color="#6366f1" small />
                      <div
                        className={css.MockInput}
                        style={{
                          borderColor: 'var(--mx-bg-surface-border, currentColor)',
                          opacity: 0.6,
                        }}
                      >
                        <Text size="T300" priority="300">
                          Reply to thread…
                        </Text>
                      </div>
                    </Box>
                  </div>
                )}
              </Box>
            ))}
          </Box>
        </Scroll>

        <div
          className={css.InputArea}
          style={{ borderTopWidth: config.borderWidth.B300, borderTopStyle: 'solid' }}
        >
          <Box gap="200" alignItems="Center">
            <AvatarCircle initial="Y" color="#6366f1" small />
            <div
              className={css.MockInput}
              style={{ borderColor: 'var(--mx-bg-surface-border, currentColor)', opacity: 0.6 }}
            >
              <Text size="T300" priority="300">
                Message # general…
              </Text>
            </div>
            <IconButton size="300" aria-label="Send">
              <Icon size="200" src={Icons.Send} />
            </IconButton>
          </Box>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant C: Overlay Panel
// ---------------------------------------------------------------------------

function OverlayVariant() {
  const [openThread, setOpenThread] = useState<string | null>(null);

  return (
    <div className={css.ContentArea}>
      {/* Timeline */}
      <div className={css.Timeline}>
        <Scroll className={css.TimelineScroll} visibility="Hover">
          <Box direction="Column" style={{ padding: `${config.space.S400} 0` }}>
            {MESSAGES.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onOpenThread={() => setOpenThread(msg.id)}
                active={openThread === msg.id}
              />
            ))}
          </Box>
        </Scroll>

        <div
          className={css.InputArea}
          style={{ borderTopWidth: config.borderWidth.B300, borderTopStyle: 'solid' }}
        >
          <Box gap="200" alignItems="Center">
            <AvatarCircle initial="Y" color="#6366f1" small />
            <div
              className={css.MockInput}
              style={{ borderColor: 'var(--mx-bg-surface-border, currentColor)', opacity: 0.6 }}
            >
              <Text size="T300" priority="300">
                Message # general…
              </Text>
            </div>
            <IconButton size="300" aria-label="Send">
              <Icon size="200" src={Icons.Send} />
            </IconButton>
          </Box>
        </div>
      </div>

      {/* Overlay */}
      {openThread && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          className={css.OverlayBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenThread(null);
          }}
        >
          <div className={css.OverlayPanel}>
            <ThreadPanelContents messageId={openThread} onClose={() => setOpenThread(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant descriptions
// ---------------------------------------------------------------------------

const VARIANTS = [
  {
    id: 'side-panel' as const,
    label: 'Side Panel',
    icon: Icons.Thread,
    description:
      'Thread opens as a persistent side panel next to the timeline (à la Discord/Slack)',
  },
  {
    id: 'inline' as const,
    label: 'Inline',
    icon: Icons.ThreadReply,
    description: 'Replies expand inline below their parent message — no extra panel needed',
  },
  {
    id: 'overlay' as const,
    label: 'Overlay',
    icon: Icons.ThreadUnread,
    description: 'Thread slides in as a floating overlay on top of the timeline',
  },
] as const;

type VariantId = (typeof VARIANTS)[number]['id'];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ThreadMockupPage() {
  const [variant, setVariant] = useState<VariantId>('side-panel');
  const currentVariant = VARIANTS.find((v) => v.id === variant)!;

  return (
    <Page className={css.MockupPage}>
      {/* Simulated room header */}
      <PageHeader balance={false}>
        <Box grow="Yes" alignItems="Center" gap="200" style={{ padding: `0 ${config.space.S300}` }}>
          <Icon size="200" src={Icons.Hash} />
          <Text size="H4" truncate>
            general
          </Text>
          <Text size="T300" priority="300" truncate style={{ marginLeft: config.space.S100 }}>
            Design system discussion
          </Text>
        </Box>

        {/* Variant badge */}
        <Box
          alignItems="Center"
          gap="100"
          style={{ padding: `0 ${config.space.S200}`, flexShrink: 0 }}
        >
          <Icon size="100" src={currentVariant.icon} />
          <Text size="T200" priority="300">
            Mockup:
          </Text>
          <Text size="T200" style={{ fontWeight: 600 }}>
            {currentVariant.label}
          </Text>
        </Box>
      </PageHeader>

      {/* Variant selector bar */}
      <div className={css.VariantBar}>
        <Icon size="200" src={Icons.Thread} />
        <Text size="T300" style={{ fontWeight: 600, marginRight: config.space.S100 }}>
          Thread UI
        </Text>
        <Text size="T200" priority="300" style={{ marginRight: config.space.S200 }}>
          Toggle between approaches:
        </Text>
        {VARIANTS.map((v) => (
          <Chip
            key={v.id}
            variant={variant === v.id ? 'Primary' : 'SurfaceVariant'}
            size="400"
            onClick={() => setVariant(v.id)}
            before={<Icon size="100" src={v.icon} />}
          >
            <Text size="T300">{v.label}</Text>
          </Chip>
        ))}
        <Box grow="Yes" />
        <Text size="T200" priority="300" style={{ maxWidth: toRem(320) }} truncate>
          {currentVariant.description}
        </Text>
      </div>

      {/* Mockup content */}
      {variant === 'side-panel' && <SidePanelVariant />}
      {variant === 'inline' && <InlineVariant />}
      {variant === 'overlay' && <OverlayVariant />}
    </Page>
  );
}
