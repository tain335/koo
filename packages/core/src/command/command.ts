import { AppData } from '../data/define';

export abstract class Command {
  exec(data: AppData) {}
}
