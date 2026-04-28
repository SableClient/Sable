import { BuiltInCommand } from '../BuiltInCommand';
import { getCmdDescription, parseUsers } from '../BuiltInCommandsUtil';
import {
  CommandExecutionContext,
  GenericCommandExecutionArgContainer,
} from '../CommandExecutionContext';

export function moderationBuiltInCommands(): Array<BuiltInCommand> {
  const retArr = new Array<BuiltInCommand>();
  retArr.push(
    new BuiltInCommand(
      getCmdDescription('disinvite'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const target = args.get('user')?.val.trim();
        const reason = args.get('reason')?.val.trim();
        context.mx.kick(context.room.roomId, target, reason);
      }
    ),
    new BuiltInCommand(
      getCmdDescription('disinvite-list'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const users = parseUsers(args.get('userList')?.val.trim());
        const reason = args.get('reason')?.val.trim();
        users.map((id) => context.mx.kick(context.room.roomId, id, reason));
      }
    ),
    new BuiltInCommand(
      getCmdDescription('kick'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const target = args.get('user')?.val.trim();
        const reason = args.get('reason')?.val.trim();
        context.mx.kick(context.room.roomId, target, reason);
      }
    ),
    new BuiltInCommand(
      getCmdDescription('ban'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const target = args.get('user')?.val.trim();
        const reason = args.get('reason')?.val.trim();
        context.mx.ban(context.room.roomId, target, reason);
      }
    ),
    new BuiltInCommand(
      getCmdDescription('unban'),
      async (
        context: CommandExecutionContext,
        args: Map<string, GenericCommandExecutionArgContainer>
      ) => {
        const target = args.get('user')?.val.trim();
        context.mx.unban(context.room.roomId, target);
      }
    )
  );
  return retArr;
}
