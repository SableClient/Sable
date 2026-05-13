import { sendFeedback } from '$utils/sendFeedbackToUser';
import { BuiltInCommand } from '../BuiltInCommand';
import { getCmdDescription } from '../BuiltInCommandsUtil';
import {
  CommandExecutionContext,
  GenericCommandExecutionArgContainer,
} from '../CommandExecutionContext';

export function coreBuiltInCommands(): Array<BuiltInCommand> {
  const retArr = new Array<BuiltInCommand>();
  retArr.push(
    new BuiltInCommand(
      getCmdDescription('discardSession'),
      async (
        context: CommandExecutionContext,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const userId = context.mx.getSafeUserId();

        try {
          const crypto = context.mx.getCrypto();
          if (!crypto) {
            sendFeedback('Encryption is not enabled on this client.', context.room, userId);
            return;
          }
          await crypto.forceDiscardSession(context.room.roomId);
          sendFeedback('Outbound encryption session discarded.', context.room, userId);
        } catch (e: any) {
          sendFeedback(`Failed to discard session: ${e.message}`, context.room, userId);
        }
      }
    ),
    new BuiltInCommand(
      getCmdDescription('join'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const roomId = args.get('room')?.val.trim();
        await context.mx.joinRoom(roomId);
      }
    )
  );
  return retArr;
}
