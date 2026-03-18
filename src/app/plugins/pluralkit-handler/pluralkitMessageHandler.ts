import {
  addOrUpdatePerMessageProfile,
  getAllPerMessageProfiles,
} from '$hooks/usePerMessageProfile';
import { sendFeedback } from '$utils/sendFeedbackToUser';
import { MatrixClient, Room } from 'matrix-js-sdk';

/**
 * a class to use as PluralKit command message handler
 *
 * @export
 * @class PluralKitCommandMessageHandler
 */
export class PluralKitCommandMessageHandler {
  private readonly mx: MatrixClient;

  private message = '';

  private readonly room: Room;

  public constructor(mx: MatrixClient, room: Room) {
    this.mx = mx;
    this.room = room;
  }

  private async memberHandler() {
    if (this.message.startsWith('pk;member new')) {
      // adding a new member
      const memberName = this.message.split('pk;member new ')[1];
      const generatedID = crypto.randomUUID();
      addOrUpdatePerMessageProfile(this.mx, { id: generatedID, name: memberName });
    } else {
      // default to looking up member info
      const listOfProfiles = await getAllPerMessageProfiles(this.mx);
      sendFeedback(
        `You currently have the following profiles set up: ${listOfProfiles.join(', ')}`,
        this.room,
        this.mx.getSafeUserId()
      );
    }
  }

  public async handleMessage(message: string) {
    this.message = message;
    if (!this.message.startsWith('pk')) return;
    if (this.message.startsWith('pk;member')) this.memberHandler();
  }
}
