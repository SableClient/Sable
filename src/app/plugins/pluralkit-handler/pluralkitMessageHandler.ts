import {
  addOrUpdatePerMessageProfile,
  getAllPerMessageProfiles,
  getPerMessageProfileById,
  PerMessageProfile,
} from '$hooks/usePerMessageProfile';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import { MatrixClient, Room } from 'matrix-js-sdk';

const pkMemberRenameRegex = /^(pk;member)\s+"?([\w\s]+)"?\s*rename\s+"?([\w\s]+)"?$/;
const pkMemberNewRegex = /^(pk;member)\s+new\s+"?([\w\s]+)"?$/;

const helpTextPkMemberNew = 'To create a new persona: pk;member new Yumi';
const helpTextPkMemberRename = 'To rename a persona: pk;member "Rain Deer" rename "Micky Mouse"';

/**
 * a class to use as PluralKit command message handler
 *
 * @export
 * @class PluralKitCommandMessageHandler
 * @author Rye
 */
export class PluralKitCommandMessageHandler {
  private readonly mx: MatrixClient;

  private message = '';

  private readonly room: Room;

  public constructor(mx: MatrixClient, room: Room) {
    this.mx = mx;
    this.room = room;
  }

  /**
   * Handler for `pk;member` commands
   * @async
   */
  private async memberHandler() {
    if (this.message.match(pkMemberNewRegex)) {
      // adding a new member
      const cmdParts = pkMemberNewRegex.exec(this.message);
      if (!cmdParts) {
        sendFeedback(`malformed input, ${helpTextPkMemberNew}`, this.room, this.mx.getSafeUserId());
        return;
      }
      const memberName = cmdParts[2];
      const generatedID = crypto.randomUUID();
      addOrUpdatePerMessageProfile(this.mx, { id: generatedID, name: memberName });
      sendFeedback(
        `new member has been created with id: ${generatedID} and name ${memberName}`,
        this.room,
        this.mx.getSafeUserId()
      );
    } else if (this.message.match(pkMemberRenameRegex)) {
      // renaming a profile based on the name
      const cmdParts = pkMemberRenameRegex.exec(this.message);
      if (!cmdParts) {
        sendFeedback(
          `malformed input, ${helpTextPkMemberRename}`,
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }
      // extract from the cmd the old and the new name
      /**
       * The old name we want to search for in our records, is in capture group 2
       */
      const oldName = cmdParts[2];
      /**
       * The new name we want to set is in capture group 3
       */
      const newName = cmdParts[3];
      /**
       * The id of the per-message-profile
       */
      const pmpId = (await getAllPerMessageProfiles(this.mx)).find(
        (pmp) => pmp.name === oldName
      )?.id;
      if (!pmpId) {
        sendFeedback(
          `Persona with name "${oldName}" doesn't exist in your records, ${helpTextPkMemberRename}`,
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }
      /**
       * get the persona record we already have for the id
       */
      const pmp = await getPerMessageProfileById(this.mx, pmpId);
      if (!pmp) {
        sendFeedback(
          "Persona record can't be retrieved, data might be corrupted",
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }
      // actually change the name
      pmp.name = newName;
      sendFeedback(
        `renaming your profile ${pmpId} from ${oldName} to ${newName}`,
        this.room,
        this.mx.getSafeUserId()
      );
      addOrUpdatePerMessageProfile(this.mx, pmp);
    } else {
      // default to looking up member info
      const listOfProfiles: PerMessageProfile[] = await getAllPerMessageProfiles(this.mx);
      const stringListOfProfiles: string = listOfProfiles
        .map((pmp: PerMessageProfile) => `${pmp.id}: ${pmp.name ? pmp.name : '(empty name)'}`)
        .join('\n');
      sendFeedback(
        `You currently have the following persona set up:\n${stringListOfProfiles}\n\n${helpTextPkMemberNew}\n${helpTextPkMemberRename}`,
        this.room,
        this.mx.getSafeUserId()
      );
    }
  }

  /**
   * check if a message is a pluralkit-style command
   * @param message the message to check
   * @returns true if it's a pluralkit style command
   */
  public static isPKCommand(message: string): boolean {
    return message.startsWith('pk;');
  }

  public async handleMessage(message: string) {
    this.message = message;
    if (!this.message.startsWith('pk')) return;
    if (this.message.startsWith('pk;member')) await this.memberHandler();
  }
}
