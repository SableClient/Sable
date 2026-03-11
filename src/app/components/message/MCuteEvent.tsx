// rendering for cute events (e.g. hug, cuddle, etc.)

import { MessageTextBody } from './layout';

export enum CuteEventType {
  Hug = 'hug',
  Cuddle = 'cuddle',
  Wave = 'wave',
  Poke = 'poke',
  Headpat = 'headpat',
  // currently unused, but could be added in the future if there's demand for it
  Kiss = 'kiss',
}

type MCuteEventProps = {
  // Content is only used to check if the event is valid, the actual text is generated based on the type and mentioned users
  content: string | undefined;
  // The type of cute event (e.g. hug, cuddle, etc.)
  type: CuteEventType;
  // The user IDs mentioned in the event (e.g. the target of the hug/cuddle/etc.)
  mentionedUserIds?: string[];
};

export function MCuteEvent({ content, type, mentionedUserIds }: MCuteEventProps) {
  if (!content) return null;

  let cuteText = '';
  switch (type) {
    case CuteEventType.Hug:
      cuteText = `hugs ${mentionedUserIds?.[0] || 'you'}`;
      break;
    case CuteEventType.Cuddle:
      cuteText = `cuddles ${mentionedUserIds?.[0] || 'you'}`;
      break;
    case CuteEventType.Kiss:
      // in here for future expansion
      // would need some kind of filtering to prevent abuse (e.g. someone sending a kiss event to a random user to harass them)
      // cuteText = `kisses ${mentionedUserIds?.[0] || 'you'}`;
      cuteText =
        'currently disabled kiss event, in light of potential abuse, may be added in the future with proper filtering';
      break;
    case CuteEventType.Wave:
      cuteText = `waves at ${mentionedUserIds?.[0] || 'you'}`;
      break;
    case CuteEventType.Poke:
      cuteText = `pokes ${mentionedUserIds?.[0] || 'you'}`;
      break;
    case CuteEventType.Headpat:
      cuteText = `gives headpats to ${mentionedUserIds?.[0] || 'you'}`;
      break;
    default:
      cuteText = `sends ${mentionedUserIds?.[0] || 'you'} a cute event`;
  }

  return (
    <MessageTextBody notice>
      <em data-cute-event data-cute-type={type}>
        {cuteText}
      </em>
    </MessageTextBody>
  );
}
