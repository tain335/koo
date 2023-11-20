import { EventHook, IEventHook } from '../event/event';
// minimap插件
export interface IPlugin<T> {
  install(host: T): (() => void) | void;
}

export abstract class Pluginable<T, P extends IPlugin<T>, E extends IEventHook<keyof E>> extends EventHook<E> {
  protected plugins: P[] = [];

  use(...plugins: P[]) {
    this.plugins.push(...plugins);
  }
}

export abstract class KPlugin<T> implements IPlugin<T> {
  install(host: T): void | (() => void) {
    return () => {};
  }
}
