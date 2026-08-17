import type { IContent, IMentions } from '$types/matrix-sdk';
import { MsgType, RelationType } from '$types/matrix-sdk';
import { customHtmlEqualsPlainText } from '$components/editor';
import { sanitizeText } from '$utils/sanitize';
import type { PerMessageProfileMsc4461 } from '$hooks/usePerMessageProfile';
import {
  convertPerMessageProfileToBeeperFormat,
  stripPerMessageProfileFormattedBody,
} from '$hooks/usePerMessageProfile';
import { MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME } from '$unstable/prefixes';

/**
 * Unified from RoomInput and MessageEditor, which had drifted: this keeps
 * RoomInput's `delete content.format` branch that MessageEditor lacked.
 */
export function buildReplacementContent(
  oldContent: IContent,
  plainText: string,
  customHtml: string,
  eventId: string,
  mMentions: IMentions,
  linkPreviews: { matched_url: string }[],
  perMessageProfile: unknown,
  pmpNoFallback: boolean
): IContent {
  const pmpDisplayname =
    perMessageProfile !== null &&
    typeof perMessageProfile === 'object' &&
    'displayname' in perMessageProfile &&
    typeof perMessageProfile.displayname === 'string' &&
    perMessageProfile.displayname.length > 0
      ? perMessageProfile.displayname
      : undefined;

  let adjustedPlainText = plainText;
  let adjustedCustomHtml = customHtml;

  if (!pmpNoFallback && pmpDisplayname) {
    const bodyPrefix = `${pmpDisplayname}: `;
    if (!adjustedPlainText.startsWith(bodyPrefix))
      adjustedPlainText = bodyPrefix + adjustedPlainText;

    const htmlPrefix = `<strong data-mx-profile-fallback>${sanitizeText(pmpDisplayname)}: </strong>`;
    if (!adjustedCustomHtml.startsWith(htmlPrefix))
      adjustedCustomHtml = htmlPrefix + adjustedCustomHtml;
  }

  const msgtype = oldContent.msgtype ?? MsgType.Text;

  const newContent: IContent = {
    msgtype,
    body: adjustedPlainText,
    'm.mentions': mMentions,
  };

  if (pmpDisplayname) {
    newContent['com.beeper.per_message_profile'] = perMessageProfile;
  }

  const content: IContent = {
    ...oldContent,
    'm.relates_to': {
      event_id: eventId,
      rel_type: RelationType.Replace,
    },
    body: `* ${adjustedPlainText}`,
    'm.mentions': mMentions,
    'm.new_content': newContent,
  };
  delete content['pet.plz.gif'];

  if (!customHtmlEqualsPlainText(adjustedCustomHtml, adjustedPlainText)) {
    newContent.format = 'org.matrix.custom.html';
    newContent.formatted_body = adjustedCustomHtml;
    content.format = 'org.matrix.custom.html';
    content.formatted_body = `* ${adjustedCustomHtml}`;
  } else {
    delete content.format;
    delete content.formatted_body;
  }

  if (oldContent.info !== undefined && oldContent.msgtype !== MsgType.Text) {
    const filename = 'filename' in oldContent ? (oldContent.filename as string) : oldContent.body;
    content.filename = filename;
    newContent.filename = filename;
    content.info = oldContent.info;
    newContent.info = oldContent.info;
    if (oldContent.file !== undefined) newContent.file = oldContent.file;
    if (oldContent.url !== undefined) newContent.url = oldContent.url;

    const spoilerKey = 'page.codeberg.everypizza.msc4193.spoiler';
    if (oldContent[spoilerKey] !== undefined) {
      content[spoilerKey] = oldContent[spoilerKey];
      newContent[spoilerKey] = oldContent[spoilerKey];
    }
  }

  content['com.beeper.linkpreviews'] = linkPreviews;
  newContent['com.beeper.linkpreviews'] = linkPreviews;

  return content;
}

// Replacing only the PMP in a content. No, you can't use the above function. I tried.
export function buildReplacementPmpContent(
  oldContent: IContent,
  eventId: string,
  newProfile: PerMessageProfileMsc4461 | undefined
) {
  const profileBeeperFormat =
    newProfile && convertPerMessageProfileToBeeperFormat(newProfile, true);

  // handle fallbacks
  if (oldContent[MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME]) {
    const plainBody = oldContent.body;
    let newPlainBody = plainBody?.replace(/^.*?: /, '');

    const formattedBody = oldContent.formatted_body;
    let newFormattedBody = formattedBody
      ? stripPerMessageProfileFormattedBody(formattedBody)
      : undefined;

    oldContent.formatted_body = newFormattedBody;
    oldContent.body = newPlainBody;
  }

  if (newProfile) {
    const escapedName = sanitizeText(newProfile.displayname);
    const htmlPrefix = `<strong data-mx-profile-fallback>${escapedName}: </strong>`;

    if (oldContent.formatted_body) {
      oldContent.formatted_body = htmlPrefix + oldContent.formatted_body;
    } else {
      // we don't have a formatted body, but we need one
      oldContent.format = 'org.matrix.custom.html';
      const escapedBody = sanitizeText(oldContent.body).replaceAll('\n', '<br/>');
      oldContent.formatted_body = `${htmlPrefix}${escapedBody}`;
    }

    const pmpPrefix = `${newProfile.displayname}: `;
    oldContent.body = pmpPrefix + oldContent.body;
  }

  const newContent = {
    ...oldContent,
    [MATRIX_UNSTABLE_PER_MESSAGE_PROFILE_PROPERTY_NAME]: profileBeeperFormat,
  };
  const content: IContent = {
    ...newContent,
    'm.new_content': newContent,
    'm.relates_to': { event_id: eventId, rel_type: RelationType.Replace },
  };

  return content;
}
