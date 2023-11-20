export type IEventHook<K extends string | number | symbol> = {
  [k in K]: (...args: any[]) => any;
};

export abstract class EventHook<T extends IEventHook<keyof T>> {
  protected emitter = new Map<string | number | symbol, T[keyof IEventHook<keyof T>][]>();

  call<E extends keyof T>(event: E, ...args: Parameters<T[E]>) {
    const fns = this.emitter.get(event as string);
    if (fns) {
      fns.forEach((fn) => fn(...args));
    }
  }

  hook<E extends keyof T>(event: E, callback: T[E]): () => void {
    let fns = this.emitter.get(event);
    if (!fns) {
      fns = [];
    }
    fns.push(callback);
    this.emitter.set(event, fns);
    return () => {
      const fns = this.emitter.get(event as string);
      if (fns) {
        const index = fns.indexOf(callback);
        if (index !== -1) {
          fns.splice(index, 1);
        }
        this.emitter.set(event, fns);
      }
    };
  }
}
