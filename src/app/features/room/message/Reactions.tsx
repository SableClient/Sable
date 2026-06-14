import type { MouseEventHandler } from 'react';
import { useCallback, useState } from 'react';
import {
  Box,
  Modal,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  PopOut,
  Text,
  Tooltip,
  TooltipProvider,
  as,
  toRem,
  type RectCords,
} from 'folds';
import classNames from 'classnames';
import type { Room } from '$types/matrix-sdk';
import { type Relations } from '$types/matrix-sdk';
import FocusTrap from 'focus-trap-react';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { factoryEventSentBy } from '$utils/matrix';
import { Reaction, ReactionTooltipMsg } from '$components/message';
import { EmojiBoard } from '$components/emoji-board';
import { sizedIcon, Smiley } from '$components/icons/phosphor';
import { useRelations } from '$hooks/useRelations';
import { stopPropagation } from '$utils/keyboard';
import { useMediaAuthentication } from '$hooks/useMediaAuthentication';
import { ReactionViewer } from '$features/room/reaction-viewer';
import * as css from './styles.css';

export type ReactionsProps = {
  room: Room;
  mEventId: string;
  canSendReaction: boolean;
  canDeleteOwn: boolean;
  relations: Relations;
  imagePackRooms?: Room[];
  onReactionToggle: (targetEventId: string, key: string, shortcode?: string) => void;
};
export const Reactions = as<'div', ReactionsProps>(
  (
    {
      className,
      room,
      relations,
      mEventId,
      canSendReaction,
      canDeleteOwn,
      onReactionToggle,
      imagePackRooms,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [viewer, setViewer] = useState<boolean | string>(false);
    const [emojiBoardAnchor, setEmojiBoardAnchor] = useState<RectCords>();
    const myUserId = mx.getUserId();
    const reactions = useRelations(
      relations,
      useCallback((rel) => [...(rel.getSortedAnnotationsByKey() ?? [])], [])
    );

    const handleViewReaction: MouseEventHandler<HTMLButtonElement> = (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      const key = evt.currentTarget.getAttribute('data-reaction-key');
      if (!key) setViewer(true);
      else setViewer(key);
    };

    const handleOpenEmojiBoard: MouseEventHandler<HTMLButtonElement> = (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      setEmojiBoardAnchor(evt.currentTarget.getBoundingClientRect());
    };

    return (
      <Box
        className={classNames(css.ReactionsContainer, className)}
        gap="200"
        wrap="Wrap"
        {...props}
        ref={ref}
      >
        {reactions.map(([key, events]) => {
          const rEvents = Array.from(events);
          if (rEvents.length === 0 || typeof key !== 'string') return null;
          const myREvent = myUserId ? rEvents.find(factoryEventSentBy(myUserId)) : undefined;
          const isPressed = !!myREvent?.getRelation();
          const canToggle = isPressed ? canDeleteOwn : canSendReaction;

          return (
            <TooltipProvider
              key={key}
              position="Top"
              tooltip={
                <Tooltip style={{ maxWidth: toRem(200) }}>
                  <Text className={css.ReactionsTooltipText} size="T300">
                    <ReactionTooltipMsg room={room} reaction={key} events={rEvents} />
                  </Text>
                </Tooltip>
              }
            >
              {(targetRef) => (
                <Reaction
                  ref={targetRef}
                  data-reaction-key={key}
                  aria-pressed={isPressed}
                  key={key}
                  mx={mx}
                  reaction={key}
                  count={events.size}
                  onClick={canToggle ? () => onReactionToggle(mEventId, key) : undefined}
                  onContextMenu={handleViewReaction}
                  aria-disabled={!canToggle}
                  useAuthentication={useAuthentication}
                />
              )}
            </TooltipProvider>
          );
        })}
        {canSendReaction && reactions.length > 0 && (
          <PopOut
            position="Top"
            align="Start"
            offset={4}
            anchor={emojiBoardAnchor}
            content={
              <EmojiBoard
                imagePackRooms={imagePackRooms ?? []}
                returnFocusOnDeactivate={false}
                allowTextCustomEmoji
                onEmojiSelect={(key) => {
                  onReactionToggle(mEventId, key);
                  setEmojiBoardAnchor(undefined);
                }}
                onCustomEmojiSelect={(mxc, shortcode) => {
                  onReactionToggle(mEventId, mxc, shortcode);
                  setEmojiBoardAnchor(undefined);
                }}
                requestClose={() => setEmojiBoardAnchor(undefined)}
              />
            }
          >
            <TooltipProvider
              position="Top"
              tooltip={
                <Tooltip>
                  <Text size="T300">Add Reaction</Text>
                </Tooltip>
              }
            >
              {(targetRef) => (
                <Box
                  as="button"
                  ref={targetRef}
                  type="button"
                  className={css.ReactionAdd}
                  aria-label="Add Reaction"
                  aria-pressed={!!emojiBoardAnchor}
                  onClick={handleOpenEmojiBoard}
                >
                  {sizedIcon(Smiley, '100')}
                </Box>
              )}
            </TooltipProvider>
          </PopOut>
        )}
        {reactions.length > 0 && (
          <Overlay
            onContextMenu={(evt: React.MouseEvent) => {
              evt.stopPropagation();
            }}
            open={!!viewer}
            backdrop={<OverlayBackdrop />}
          >
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  returnFocusOnDeactivate: false,
                  onDeactivate: () => setViewer(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                <Modal variant="Surface" size="300">
                  <ReactionViewer
                    room={room}
                    initialKey={typeof viewer === 'string' ? viewer : undefined}
                    relations={relations}
                    requestClose={() => setViewer(false)}
                  />
                </Modal>
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
      </Box>
    );
  }
);
