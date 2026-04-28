import { AbstractCommand } from './AbstractCommand';

export class BuiltInCommand extends AbstractCommand {
  static meow() {
    return 'meow';
  }
}
