import { Box, Text, as, color, config } from 'folds';
import type { MatrixClient } from '$types/matrix-sdk';

import { Lock, timelineIcon, Trash, Warning, X } from '$components/icons/phosphor';
import { ReactionKeyInline } from '$components/message/ReactionKeyInline';
import { BreakWord } from '$styles/Text.css';

const warningStyle = { color: color.Warning.Main, opacity: config.opacity.P300 };
const criticalStyle = { color: color.Critical.Main, opacity: config.opacity.P300 };

export const MessageDeletedContent = as<'div', { children?: never; reason?: string }>(
  ({ reason, ...props }, ref) => (
    <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
      {timelineIcon(Trash, { style: warningStyle })}
      {reason ? (
        <i>This message has been deleted. {reason}</i>
      ) : (
        <i>This message has been deleted</i>
      )}
    </Box>
  )
);

export const ReactionDeletedContent = as<
  'div',
  {
    children?: never;
    reactionKey?: string;
    shortcode?: string;
    mx?: MatrixClient;
    useAuthentication?: boolean;
    reason?: string;
    hideIcon?: boolean;
  }
>(({ reactionKey, shortcode, mx, useAuthentication, reason, hideIcon, ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
    {!hideIcon && timelineIcon(Trash, { style: warningStyle })}
    {reactionKey || shortcode ? (
      <i>
        This reaction has been removed:{' '}
        {mx ? (
          <ReactionKeyInline
            mx={mx}
            reactionKey={reactionKey}
            shortcode={shortcode}
            useAuthentication={useAuthentication}
          />
        ) : (
          (reactionKey ?? `:${shortcode}:`)
        )}
        {reason ? ` ${reason}` : ''}
      </i>
    ) : reason ? (
      <i>This reaction has been removed. {reason}</i>
    ) : (
      <i>This reaction has been removed</i>
    )}
  </Box>
));

export const MessageUnsupportedContent = as<'div', { children?: never; body?: string }>(
  ({ body, ...props }, ref) => (
    <Box
      as="span"
      alignItems="Center"
      direction="Row"
      gap="100"
      style={criticalStyle}
      {...props}
      ref={ref}
    >
      {timelineIcon(Warning, { style: criticalStyle })}
      <span className={BreakWord} style={{ flex: '1 1 auto', minWidth: 0 }}>
        <i>Unsupported message</i>
        {body && `: ${body}`}
        {!body && ' (no body)'}
      </span>
    </Box>
  )
);

export const MessageFailedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
    {timelineIcon(Warning, { style: criticalStyle })}
    <i>Failed to load message</i>
  </Box>
));

export const MessageBadEncryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
    {timelineIcon(Lock, { style: warningStyle })}
    <i>Unable to decrypt message</i>
  </Box>
));

export const MessageNotDecryptedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
    {timelineIcon(Lock, { style: warningStyle })}
    <i>This message is not decrypted yet</i>
  </Box>
));

// display body of the message if it is available, as it may give some clue about why the message is broken
export const MessageBrokenContent = as<'div', { children?: never; body?: string }>(
  ({ body, ...props }, ref) => (
    <Box
      as="span"
      alignItems="Center"
      direction="Row"
      gap="100"
      style={criticalStyle}
      {...props}
      ref={ref}
    >
      {timelineIcon(Warning, { style: criticalStyle })}
      <span className={BreakWord} style={{ flex: '1 1 auto', minWidth: 0 }}>
        <i>Broken message</i>
        {body && `: ${body}`}
        {!body && ' (no body)'}
      </span>
    </Box>
  )
);

export const MessageEmptyContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={criticalStyle} {...props} ref={ref}>
    {timelineIcon(Warning, { style: criticalStyle })}
    <i>Empty message</i>
  </Box>
));

export const MessageBlockedContent = as<'div', { children?: never }>(({ ...props }, ref) => (
  <Box as="span" alignItems="Center" gap="100" style={warningStyle} {...props} ref={ref}>
    {timelineIcon(X, { style: warningStyle })}
    <i>Message from a blocked user</i>
  </Box>
));

export const MessageEditedContent = as<'span', { children?: never }>(({ ...props }, ref) => (
  <Text as="span" size="T200" priority="300" {...props} ref={ref}>
    {' (edited)'}
  </Text>
));
