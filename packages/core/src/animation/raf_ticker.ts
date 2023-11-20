import { EventHook } from '../event/event';

export interface ITicker {
  init(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  onTick(callback: (t: number) => void): () => void;
}

interface IRafITickHook {
  tick(t: number): void;
}

export class RafTicker extends EventHook<IRafITickHook> implements ITicker {
  private frameId = -1;

  init(): void {
    this.tick();
  }

  destroy(): void {
    cancelAnimationFrame(this.frameId);
  }

  pause(): void {}

  resume(): void {}

  tick() {
    this.frameId = requestAnimationFrame((timestamp) => {
      this.call('tick', timestamp);
      this.tick();
    });
  }

  onTick(callback: (t: number) => void): () => void {
    return this.hook('tick', callback);
  }
}
