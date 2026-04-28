import { CommandDefinition } from '$types/schemas/command';
import {
  CommandExecutionContext,
  GenericCommandExecutionArgContainer,
  GenericCommandExecutionArgContainerConstructorParams,
} from './CommandExecutionContext';

export abstract class AbstractCommand {
  protected commandDefinition: CommandDefinition;

  protected behavior: (
    context: CommandExecutionContext,
    args: Map<string, GenericCommandExecutionArgContainer>
  ) => Promise<void>;

  protected args: Map<string, GenericCommandExecutionArgContainer>;

  constructor(
    commandDefinition: CommandDefinition,
    fn: (
      context: CommandExecutionContext,
      args: Map<string, GenericCommandExecutionArgContainer>
    ) => Promise<void>
  ) {
    this.commandDefinition = commandDefinition;
    this.behavior = fn;
    this.args = new Map<string, GenericCommandExecutionArgContainer>();
    this.commandDefinition.attributes?.forEach((attr) => {
      const cont: GenericCommandExecutionArgContainer = new GenericCommandExecutionArgContainer({
        desc: attr.description,
        required: attr.required,
        val: '',
        type: attr.type,
        format: attr.format,
      } satisfies GenericCommandExecutionArgContainerConstructorParams);
      this.args.set(attr.id, cont);
    });
  }

  public getCommandArgsList(): Map<string, GenericCommandExecutionArgContainer> {
    return this.args;
  }

  public getCommandDefinition(): CommandDefinition {
    return this.commandDefinition;
  }

  public async execute(context: CommandExecutionContext): Promise<void> {
    return this.behavior(context, this.args);
  }

  public updateArgValue(argId: string, argValue: any): void {
    const arg = this.args.get(argId);
    if (!arg) {
      throw new Error(`argument named ${argId} not found`);
    }
    if (typeof argValue === 'string' && argValue.trim() === '') {
      return;
    }
    arg.val = argValue;
    this.args.set(argId, arg);
    console.log(`updated value of ${argId} to ${argValue}`);
  }
}
