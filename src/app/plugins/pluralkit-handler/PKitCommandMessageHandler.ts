import type { PerMessageProfile } from '$hooks/usePerMessageProfile';
import {
  addOrUpdatePerMessageProfile,
  associateProxyWithProfile,
  dropProxyAssociationForPMP,
  getAllPerMessageProfiles,
  getPerMessageProfileById,
} from '$hooks/usePerMessageProfile';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import type { MatrixClient, Room } from '$types/matrix-sdk';
import { generateShortId } from '$utils/shortIdGen';

const pkMemberRenameRegex = /^(pk;member)\s+"?([\w\s]+)"?\s*rename\s+"?([\w\s]+)"?$/;
const pkMemberNewRegex = /^(pk;member)\s+new\s+"?([\w\s]+)"?$/;
const pkMemberNewProxy = /^(pk;member)\s+"?([\w\s]+)"?\s+proxy(\s+add)?\s+(.*text.*)$/;
const pkMemberRemoveProxy = /^(pk;member)\s+"?([\w\s]+)"?\s+proxy\s+remove\s+(.*text.*)$/;

const helpTextPkMemberNew = 'To create a new persona: pk;member new Yumi';
const helpTextPkMemberRename = 'To rename a persona: pk;member "Rain Deer" rename "Micky Mouse"';
const helpTextPkMemberNewProxy = 'To add a shorthand to a persona: pk;member Yumi proxy [text]';
const helpTextPkMemberRemoveProxy =
  'To remove a shorthand from a persona: pk;member Yumi proxy remove [text]';
const helpTextPkMember = `Available 'pk;member' commands:\n${helpTextPkMemberNew}\n${helpTextPkMemberRename}\n${helpTextPkMemberNewProxy}\n${helpTextPkMemberRemoveProxy}`;

function regexEscapeFallBackFunc(template: string): string {
  return template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * build a regex to recognize proxies
 * a template can be for example `[text]` or `f:text`
 *
 * @param {string} template
 * @return {*}  {RegExp}
 */
function buildRegex(template: string): RegExp {
  const [before = '', after = ''] = template.split('text');
  const escape = (s: string) =>
    // @ts-ignore TS2339 - RegExp.escape is a new/proposed method
    typeof RegExp.escape === 'function' ? RegExp.escape(s) : regexEscapeFallBackFunc(s);

  const pattern = `${escape(before)}(.+)${escape(after)}`;
  return new RegExp(`^${pattern}$`);
}

/**
 * a class to use as PluralKit command message handler
 *
 * @export
 * @class PluralKitCommandMessageHandler
 * @author Rye
 */
export class PKitCommandMessageHandler {
  /**
   * the matrix client we use, is set in the constructor
   *
   * @private
   * @type {MatrixClient}
   * @memberof PKitCommandMessageHandler
   */
  private readonly mx: MatrixClient;

  private message = '';

  private readonly room: Room;

  /**
   * flag to interpret the name given as id
   *
   * @private
   * @type {boolean}
   * @memberof PKitCommandMessageHandler
   */
  private useIdInsteadOfNameWherePossible: boolean;

  public constructor(mx: MatrixClient, room: Room) {
    this.mx = mx;
    this.room = room;
    this.useIdInsteadOfNameWherePossible = false;
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
      if (!memberName) {
        sendFeedback(`malformed input, ${helpTextPkMemberNew}`, this.room, this.mx.getSafeUserId());
        return;
      }
      const generatedID = generateShortId(5);
      sendFeedback(
        `adding new member has been created with id: ${generatedID} and name ${memberName}`,
        this.room,
        this.mx.getSafeUserId()
      );
      await addOrUpdatePerMessageProfile(this.mx, {
        id: generatedID,
        name: memberName,
      });
      sendFeedback(
        `added new member has been created with id: ${generatedID} and name ${memberName}`,
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
          `Persona with name "${oldName}" doesn't exist in your records, ${helpTextPkMemberNew}`,
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
      if (!newName) {
        sendFeedback(
          `malformed input, ${helpTextPkMemberRename}`,
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }
      pmp.name = newName;
      sendFeedback(
        `renaming your profile ${pmpId} from ${oldName} to ${newName}`,
        this.room,
        this.mx.getSafeUserId()
      );
      await addOrUpdatePerMessageProfile(this.mx, pmp);
    } else if (pkMemberRemoveProxy.test(this.message)) {
      const cmdParts = pkMemberRemoveProxy.exec(this.message);
      if (!cmdParts) return;
      const name = cmdParts[2];
      const matchAgainst = cmdParts[3];
      const pmpId = this.useIdInsteadOfNameWherePossible
        ? name
        : (await getAllPerMessageProfiles(this.mx)).find((pmp) => pmp.name === name)?.id;
      if (!pmpId) {
        sendFeedback(
          `Persona with ${this.useIdInsteadOfNameWherePossible ? 'id' : 'name'} "${name}" doesn't exist in your records, ${helpTextPkMemberNew}`,
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }

      if (!matchAgainst) {
        sendFeedback(
          `malformed input, ${helpTextPkMemberRemoveProxy}`,
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }
      await dropProxyAssociationForPMP(this.mx, matchAgainst);

      sendFeedback(
        `Persona with ${this.useIdInsteadOfNameWherePossible ? 'id' : 'name'} "${name}" (${pmpId}) is now no longer associated with ${matchAgainst}`,
        this.room,
        this.mx.getSafeUserId()
      );
    } else if (pkMemberNewProxy.test(this.message)) {
      const cmdParts = pkMemberNewProxy.exec(this.message);
      if (!cmdParts) return;
      const name = cmdParts[2];
      const matchAgainst = cmdParts[4];
      const pmpId = this.useIdInsteadOfNameWherePossible
        ? name
        : (await getAllPerMessageProfiles(this.mx)).find((pmp) => pmp.name === name)?.id;
      if (!pmpId) {
        sendFeedback(
          `Persona with ${this.useIdInsteadOfNameWherePossible ? 'id' : 'name'} "${name}" doesn't exist in your records, ${helpTextPkMemberNew}`,
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }
      if (!matchAgainst) {
        sendFeedback(
          `malformed input, ${helpTextPkMemberNewProxy}`,
          this.room,
          this.mx.getSafeUserId()
        );
        return;
      }
      const matchAgainstRegExp = buildRegex(matchAgainst);
      await associateProxyWithProfile(this.mx, pmpId, matchAgainst, matchAgainstRegExp, false);
      sendFeedback(
        `Persona with ${this.useIdInsteadOfNameWherePossible ? 'id' : 'name'} "${name}" (${pmpId}) is now associated with ${matchAgainst}`,
        this.room,
        this.mx.getSafeUserId()
      );
    } else {
      // default to looking up member info
      const listOfProfiles: PerMessageProfile[] = await getAllPerMessageProfiles(this.mx);
      const stringListOfProfiles: string = listOfProfiles
        .map((pmp: PerMessageProfile) => `${pmp.id}: ${pmp.name ? pmp.name : '(empty name)'}`)
        .join('\n');
      sendFeedback(
        `If you see this, you have messed up a command\n\nYou currently have the following persona set up:\n${stringListOfProfiles}\n\n${helpTextPkMember}`,
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

  /**
   * handle a message, which might be a pk command
   * @param message the message we want to handle
   * @returns void
   */
  public async handleMessage(message: string, useId?: boolean): Promise<void> {
    this.message = message;
    this.useIdInsteadOfNameWherePossible = useId ?? false;
    if (!this.message.startsWith('pk;')) return;
    if (this.message.startsWith('pk;member')) {
      await this.memberHandler();
      return;
    }
    sendFeedback(
      `Command currently not supported, right now compatibility is limited and only a subset of pk;member is supported\n\n${helpTextPkMember}`,
      this.room,
      this.mx.getSafeUserId()
    );
  }
}
