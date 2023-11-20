import { Command } from './command';
import { AppData } from '../data/define';
import { OpRecord } from '../app/op';

export class UndoCommand extends Command {
  constructor(public source: Command, private opRecord: OpRecord) {
    super();
  }

  exec(data: AppData): void {
    this.opRecord.undo(data);
  }
}
