import type { IContent, IMentions } from '$types/matrix-sdk';
import { MsgType, RelationType } from '$types/matrix-sdk';
import { customHtmlEqualsPlainText } from '$components/editor';
import { sanitizeText } from '$utils/sanitize';

/**
 * Build the replacement content object for a message edit.
 * Unified from RoomInput and MessageEditor — uses the RoomInput version
 * (which has a `delete content.format` branch that MessageEditor lacked).
 */
export function buildReplacementContent(
  oldContent: IContent,
  plainText: string,
  customHtml: string,
  eventId: string,
  mMentions: IMentions,
  linkPreviews: { matched_url: string }[],
  perMessageProfile: unknown
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

  if (pmpDisplayname) {
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
