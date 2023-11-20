import { Command } from './command';

export class BatchCommand extends Command {
  constructor(private commands: Command[]) {
    super();
  }

  exec(data: any): void {
    this.commands.forEach((cmd) => {
      cmd.exec(data);
    });
  }
}
