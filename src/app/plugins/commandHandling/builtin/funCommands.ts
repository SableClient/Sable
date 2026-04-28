import { BuiltInCommand } from '../BuiltInCommand';
import { getCmdDescription } from '../BuiltInCommandsUtil';
import {
  CommandExecutionContext,
  GenericCommandExecutionArgContainer,
} from '../CommandExecutionContext';

export function funBuiltInCommands(): Array<BuiltInCommand> {
  const retArr = new Array<BuiltInCommand>();
  retArr.push(
    new BuiltInCommand(
      getCmdDescription('headpat'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const target = args.get('user')?.val.trim();
        await context.mx.sendMessage(context.room.roomId, {
          msgtype: 'm.emote',
          'm.mentions': {
            user_ids: target ? [target] : [],
          },
          body: `pats ${target || 'you'}`,
          'fyi.cisnt.headpat': true,
        } as any);
      }
    )
  );
  return retArr;
}
