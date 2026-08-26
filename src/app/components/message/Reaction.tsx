import { useState } from 'react';
import { Box, Text, as } from 'folds';
import { sizedIcon, Warning } from '$components/icons/phosphor';
import classNames from 'classnames';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { getHexcodeForEmoji, getShortcodeFor } from '$plugins/emoji';
import { getMemberDisplayName } from '$utils/room/display';
import { eventWithShortcode, getMxIdLocalPart, mxcUrlToHttp } from '$utils/matrix';
import { useAtomValue } from 'jotai';
import { Image as MediaImage } from '$components/media';
import { useRenderableMediaUrl } from '$hooks/useRenderableMediaUrl';
import { nicknamesAtom } from '$state/nicknames';
import { settingsAtom } from '$state/settings';
import { useSetting } from '$state/hooks/settings';
import * as css from './Reaction.css';

export const Reaction = as<
  'button',
  {
    mx: MatrixClient;
    count: number;
    reaction: string;
    useAuthentication?: boolean;
  }
>(({ className, mx, count, reaction, useAuthentication, ...props }, ref) => {
  const [imgError, setImgError] = useState(false);
  const [hideSingleReactionCount] = useSetting(settingsAtom, 'hideSingleReactionCount');
  const showCount = !hideSingleReactionCount || count > 1;
  const rawReactionUrl = reaction.startsWith('mxc://')
    ? (mxcUrlToHttp(mx, reaction, useAuthentication) ?? undefined)
    : undefined;
  const renderableReactionUrl = useRenderableMediaUrl(rawReactionUrl);

  return (
    <Box
      as="button"
      className={classNames(css.Reaction, !showCount && css.ReactionNoCount, className)}
      alignItems="Center"
      shrink="No"
      gap="200"
      {...props}
      ref={ref}
    >
      <Text className={css.ReactionText} as="span" size="T400">
        {reaction.startsWith('mxc://') ? (
          (() => {
            if (imgError)
              return (
                // Image loaded but fetch failed  Eshow a small warning icon so the
                // reaction button still renders correctly and the user can see
                // something went wrong rather than a browser broken-image icon.
                <span title="Failed to load emoji image" aria-label="Failed to load emoji image">
                  {sizedIcon(Warning, '100', { style: { opacity: 0.5 } })}
                </span>
              );
            return (
              <MediaImage
                className={css.ReactionImg}
                src={renderableReactionUrl}
                alt={reaction}
                onError={() => setImgError(true)}
              />
            );
          })()
        ) : (
          <Text as="span" size="Inherit" truncate>
            {reaction}
          </Text>
        )}
      </Text>
      {showCount && (
        <Text as="span" size="T300">
          {count}
        </Text>
      )}
    </Box>
  );
});

type ReactionTooltipMsgProps = {
  room: Room;
  reaction: string;
  events: MatrixEvent[];
};

export function ReactionTooltipMsg({ room, reaction, events }: ReactionTooltipMsgProps) {
  const shortCodeEvt = events.find(eventWithShortcode);
  const shortcode =
    shortCodeEvt?.getContent().shortcode ??
    getShortcodeFor(getHexcodeForEmoji(reaction)) ??
    reaction;
  const nicknames = useAtomValue(nicknamesAtom);
  const names = events.map(
    (ev: MatrixEvent) =>
      getMemberDisplayName(room, ev.getSender() ?? 'Unknown', nicknames) ??
      getMxIdLocalPart(ev.getSender() ?? 'Unknown') ??
      'Unknown'
  );

  return (
    <>
      {names.length === 1 && <b>{names[0]}</b>}
      {names.length === 2 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names[1]}</b>
        </>
      )}
      {names.length === 3 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[1]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names[2]}</b>
        </>
      )}
      {names.length > 3 && (
        <>
          <b>{names[0]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[1]}</b>
          <Text as="span" size="Inherit" priority="300">
            {', '}
          </Text>
          <b>{names[2]}</b>
          <Text as="span" size="Inherit" priority="300">
            {' and '}
          </Text>
          <b>{names.length - 3} others</b>
        </>
      )}
      <Text as="span" size="Inherit" priority="300">
        {' reacted with '}
      </Text>
      :<b>{shortcode}</b>:
    </>
  );
}
