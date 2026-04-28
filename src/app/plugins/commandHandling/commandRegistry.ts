import { AbstractCommand } from './AbstractCommand';
import { BuiltInCommand } from './BuiltInCommand';

const builtInCommandRegistry: Map<string, AbstractCommand> = new Map<string, BuiltInCommand>();
const roomCommandRegistry: Map<string, AbstractCommand> = new Map<string, AbstractCommand>();
const customCommandRegistry: Map<string, AbstractCommand> = new Map<string, AbstractCommand>();

export enum CommandRegistry {
  BuiltIn,
  Room,
  Custom,
}

export function addToCommandRegistry(
  commandList: Array<AbstractCommand>,
  registry: CommandRegistry
): void {
  commandList.forEach((cmd) => {
    if (registry === CommandRegistry.BuiltIn)
      builtInCommandRegistry.set(cmd.getCommandDefinition().id, cmd);
    else if (registry === CommandRegistry.Room)
      roomCommandRegistry.set(cmd.getCommandDefinition().id, cmd);
    else if (registry === CommandRegistry.Custom)
      customCommandRegistry.set(cmd.getCommandDefinition().id, cmd);
  });
}

export function clearRoomCommandRegistry(): void {
  roomCommandRegistry.clear();
}

export function getFromCommandRegistry(id: string): AbstractCommand {
  if (customCommandRegistry.has(id)) {
    return customCommandRegistry.get(id)!;
  }
  if (roomCommandRegistry.has(id)) {
    return roomCommandRegistry.get(id)!;
  }
  if (builtInCommandRegistry.has(id)) {
    return builtInCommandRegistry.get(id)!;
  }
  throw new Error('Command not found');
}
