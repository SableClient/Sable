import { addToCommandRegistry, CommandRegistry } from '../commandRegistry';
import { coreBuiltInCommands } from './coreCommands';
import { cosmeticBuiltInCommands } from './cosmeticCommands';
import { funBuiltInCommands } from './funCommands';
import { miscBuiltInCommands } from './miscCommands';
import { moderationBuiltInCommands } from './moderationCommands';

export function loadBuildInCommands(): void {
  addToCommandRegistry(cosmeticBuiltInCommands(), CommandRegistry.BuiltIn);
  addToCommandRegistry(funBuiltInCommands(), CommandRegistry.BuiltIn);
  addToCommandRegistry(miscBuiltInCommands(), CommandRegistry.BuiltIn);
  addToCommandRegistry(coreBuiltInCommands(), CommandRegistry.BuiltIn);
  addToCommandRegistry(moderationBuiltInCommands(), CommandRegistry.BuiltIn);
}
