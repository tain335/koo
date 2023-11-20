import { GraphStruct } from './graph';
import { OpRecord, OpRecorder } from './op';
import { BatchCommand } from '../command/batch_command';
import { Command } from '../command/command';
import { AppState } from '../data/define';
import { KPlugin, Pluginable } from '../plugin/plugin';
import { IRenderer, RenderHint } from '../renderer/renderer';
import { ConsoleLogger, ILogger } from '../logger/console_logger';

export interface AppOptions<T> {
  logger?: ILogger;
  renderer: IRenderer<T>;
}

export interface IAppHook<T = void> {
  beforeCommandApply: (state: AppState, command: Command) => void;
  afterCommandApply: (state: AppState, command: Command, opRecord: OpRecord) => void;
  update: (app: AppHost<T>, forceLayout: boolean) => void;
  beforeInit: (app: AppHost<T>) => void;
  afterInit: (app: AppHost<T>) => void;
}

export type AppHost<T> = Omit<App<T>, 'use' | 'init'>;

// 与yjs结合，两种方式
// 1. 重新利用YArray和YMap重新实现GraphInterface
// 2. 在指令应用时拦截，变换成操作Yjs的数据结构的操作，然后等操作完成把数据结构同步回GraphStruct
// 感觉第一种方式更加优雅，但是代码会更多
// 还是第二种方式好，因为存在过渡状态需要把GraphStruct变成immutable

// app state在一个过渡（动画/一些其他状态）状态的时候，所有操作都应该进入指令队列等待过渡状态的结束才能应用 // todo
export class App<T = void> extends Pluginable<App<T>, KPlugin<App<T>>, IAppHook<T>> {
  state: AppState;

  logger: ILogger;

  renderer: IRenderer<T>;

  el: Element;

  opts: AppOptions<T>;

  private cleanups: ((() => void) | void)[] = [];

  constructor(opts: AppOptions<T>) {
    super();
    this.opts = opts;
  }

  beginBatchCommnd() {
    this.state.batchCommand = true;
  }

  completeBatchCommand() {
    this.state.batchCommand = false;
    const newCmd = new BatchCommand(this.state.commandStack);
    this.state.batchCommand = false;
    this.state.commandStack = [];
    this.applyCommand(newCmd);
  }

  applyCommand(command: Command): void {
    if (this.state.batchCommand) {
      this.state.commandStack.push(command);
      return;
    }
    this.call('beforeCommandApply', this.state, command);

    const opRecord = this.state.data.root.transaction(() => {
      // @ts-ignore
      this.state.nextCommand.exec(this.state.data);
    });

    this.state.version++;
    // 这里可以同步opRecord到yjs处理
    this.call('afterCommandApply', this.state, command, opRecord);
    this.call('update', this, true);
  }

  beforeStateUpdate(callback: IAppHook<T>['beforeCommandApply']) {
    return this.hook('beforeCommandApply', callback);
  }

  afterStateUpdate(callback: IAppHook<T>['afterCommandApply']) {
    return this.hook('afterCommandApply', callback);
  }

  // 获取初始化参数，提供修改参数机会
  beforeInit(callback: IAppHook<T>['beforeInit']) {
    return this.hook('beforeInit', callback);
  }

  // app完成所有组件初始化
  afterInit(callback: IAppHook<T>['afterInit']) {
    return this.hook('afterInit', callback);
  }

  onUpdate(callback: IAppHook<T>['update']) {
    return this.hook('update', callback);
  }

  private validateOptions() {}

  private initSelf() {
    if (this.opts.logger) {
      this.logger = this.opts.logger;
    } else {
      this.logger = new ConsoleLogger();
    }
    this.renderer = this.opts.renderer;

    this.state = {
      version: 0,
      commandStack: [],
      data: {
        root: new GraphStruct(new OpRecorder()),
      },
      batchCommand: false,
    };
    this.renderer.init(this);
  }

  // 1. 校验初始化参数
  // 2. 初始化自身状态和renderer
  // 3. 初始化插件
  init(el: HTMLElement) {
    this.el = el;
    this.call('beforeInit', this);
    this.validateOptions();
    this.initSelf();
    this.cleanups = this.plugins.map((plugin) => {
      return plugin.install(this);
    });
    this.call('afterInit', this);
    this.renderer.scheduleRender(RenderHint.ForceUpate, this.state.data.root);
    this.cleanups.push(
      this.onUpdate((app, forceUpdate) => {
        this.scheduleRender(forceUpdate);
      }),
    );
  }

  update(forceUpdate = true) {
    this.call('update', this, forceUpdate);
  }

  scheduleRender(forceUpdate = true) {
    this.renderer.scheduleRender(
      forceUpdate ? RenderHint.ForceUpate : RenderHint.Render,
      forceUpdate ? this.state.data.root : undefined,
    );
  }

  destory() {
    this.cleanups.forEach((cleanup) => {
      if (cleanup) {
        cleanup();
      }
    });
  }

  use(plugin: KPlugin<App<T>>) {
    this.plugins.push(plugin);
  }
}
