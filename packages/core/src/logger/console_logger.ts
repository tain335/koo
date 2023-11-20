export interface ILogger {
  info(...args: string[]): void;
  warn(...args: string[]): void;
  debug(...args: string[]): void;
  error(...args: string[]): void;
}

export class ConsoleLogger implements ILogger {
  info(...args: string[]): void {
    console.log.apply(null, args);
  }

  warn(...args: string[]): void {
    console.warn.apply(null, args);
  }

  debug(...args: string[]): void {
    console.debug.apply(null, args);
  }

  error(...args: string[]): void {
    console.error.apply(null, args);
  }
}
