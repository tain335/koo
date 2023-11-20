import { AppData } from '../data/define';

export class OpRecord {
  execOps: any[] = [];

  undoOps: any[] = [];

  redo(data: AppData) {
    this.execOps.forEach((op) => {
      data.root.applyOp(op[0], op.slice(1));
    });
  }

  undo(data: AppData) {
    this.undoOps.forEach((op) => {
      data.root.applyOp(op[0], op.slice(1));
    });
  }
}

export class OpRecorder {
  private opRecord: OpRecord;

  startRecorder() {
    this.opRecord = new OpRecord();
  }

  stopRecorder(): OpRecord {
    return this.opRecord;
  }

  record(execOp: any[], undo: any[]) {
    this.opRecord.execOps.push(execOp);
    this.opRecord.undoOps.push(undo);
  }
}

export class NopRecorder extends OpRecorder {
  record(execOp: any[], undo: any[]): void {
    // no record
  }
}
