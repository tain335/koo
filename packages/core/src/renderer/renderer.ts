import { isEqual, isUndefined } from 'lodash';
import { RenderGraph, RenderLink, RenderNode } from './render_graph';
import { Rect } from './rect';
import { KPlugin, IPlugin, Pluginable } from '../plugin/plugin';
import { IGraph } from '../data/define';
import { App, AppHost } from '../app/app';
import { ITransitionConfig, PropertyTransitionTween, Timeline, Tween } from '../animation/animation';
import { GraphStruct } from '../app/graph';
import { RafTicker } from '../animation/raf_ticker';

export interface IRenderer<T> {
  init(app: App<T>): void;
  scheduleRender(hint: RenderHint, nextRoot?: IGraph): void;
  onRender(callback: (content: T) => void): () => void;
  updateViewport(v: Viewport): void;
}

export type NextCallback<T> = () => T | void;

export interface IRenderHook<T> {
  beforeRender: (renderer: RendererHost<T>) => void;
  onRender: (stage: T, renderer: RendererHost<T>) => void;
  renderStage: (next: NextCallback<T>, renderer: RendererHost<T>) => T;
  renderNode: (next: NextCallback<T>, node: RenderNode, renderer: RendererHost<T>) => T;
  renderLink: (next: NextCallback<T>, link: RenderLink, renderer: RendererHost<T>) => T;
  performLayout: (next: NextCallback<RenderGraph>, root: RenderGraph, renderer: RendererHost<T>) => void;
  performClip: (next: NextCallback<RenderGraph>, renderGraph: RenderGraph, render: RendererHost<T>) => RenderGraph;
  performRender: (next: NextCallback<T>, renderGraph: RenderGraph, renderer: RendererHost<T>) => T;
}

export type RendererHost<T = void> = Omit<Renderer<T>, 'use' | 'render' | 'init' | 'app'> & { app: AppHost<T> };

export type RendererPlugin<T = void> = IPlugin<RendererHost<T>>;

type Shift<T extends any[]> = T extends [infer L, ...infer R] ? R : T;

export type Viewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface ListMutation<T = any> {
  adds: T[];
  removes: { node: T; pos: number }[];
  updates: { older: T; newer: T }[];
}

interface GraphMutation {
  nodeMutation: ListMutation<RenderNode>;
  linkMutation: ListMutation<RenderLink>;
}

function diffList<T extends RenderNode | RenderLink>(older: T[], newer: T[]) {
  const olderMap = new Map<string, T>();
  const newerMap = new Map<string, T>();
  const removes: { node: T; pos: number }[] = [];
  const adds: T[] = [];
  const updates: { older: T; newer: T }[] = [];
  for (let i = 0; i < older.length; i++) {
    olderMap.set(older[i].id, older[i]);
  }
  for (let i = 0; i < newer.length; i++) {
    const node = newer[i];
    newerMap.set(node.id, node);
    if (!olderMap.get(node.id)) {
      adds.push(node);
    } else {
      updates.push({ older: olderMap.get(node.id) as T, newer: node });
    }
  }
  let pos = 0;
  for (let i = 0; i < older.length; i++) {
    const node = older[i];
    if (!newerMap.get(node.id)) {
      const newNode = newer[i];
      const hasLeavingTweens = node.hasLeavingTweens();
      // 替换
      if (newNode && !olderMap.get(newNode.id)) {
        // replace不停触发的时候，会出现多个节点同时插入的同一个位置的情况
        if (hasLeavingTweens) {
          newNode.successor = node;
          node.predecessor = newNode;
        }
        pos++;
        removes.push({ node, pos: -1 });
        // 删除
      } else if (hasLeavingTweens) {
        removes.push({ node, pos: pos++ });
      } else {
        removes.push({ node, pos: -1 });
      }
    } else {
      // 如果存在
      pos++;
    }
  }
  return {
    adds,
    updates,
    removes,
  };
}

function diffGraph(older: RenderGraph, newer: RenderGraph): GraphMutation {
  const nodeMutation = diffList(older.nodes, newer.nodes);
  const linkMutation = diffList(older.links, newer.links);
  return {
    nodeMutation,
    linkMutation,
  };
}

function clonePropertiesFromObj<T extends { [key: string]: any }>(properties: (keyof T)[], obj: any): Partial<T> {
  const s: Partial<T> = {};
  properties.forEach((key: keyof T) => {
    s[key] = obj[key];
  });
  return s;
}

function diffProperties(objA: any, objB: any, filter?: (key: string) => boolean) {
  const cloneObjA: any = {};
  const cloneObjB: any = {};
  Object.keys(objA).forEach((key) => {
    if (filter?.(key)) {
      return;
    }
    if (!isUndefined(objA[key]) && !isUndefined(objB[key]) && !isEqual(objA[key], objB[key])) {
      cloneObjA[key] = objA[key];
      cloneObjB[key] = objB[key];
    }
  });

  return [cloneObjA, cloneObjB];
}

export enum AnimationStep {
  Enter = 1,
  Update = 2,
  Leave = 4,
}

export enum RenderHint {
  Render = 0,
  ForceUpate = 1,
  AnimationUpdate = 2,
  ViewportUpdate = 4,
  AnimationUpdateWithoutLayout = 8, // 仅需要render
}

interface RenderAction {
  needNewRoot: boolean;
  needLayout: boolean;
  needAnimation: boolean;
  needClip: boolean;
}

function computeActionFromHint(hint: number): RenderAction {
  const action: RenderAction = {
    needNewRoot: false,
    needLayout: false,
    needAnimation: false,
    needClip: true,
  };
  if (hint & RenderHint.ForceUpate) {
    action.needNewRoot = true;
    action.needLayout = true;
    action.needClip = true;
    action.needAnimation = true;
    return action;
  }
  // animation update 也要重新计算有没有新的animation触发
  // animation upate 需要重新出发layout吗
  if (hint & RenderHint.AnimationUpdate) {
    action.needAnimation = true;
    action.needLayout = true;
    action.needClip = true;
  }
  if (hint & RenderHint.ViewportUpdate) {
    action.needLayout = true;
    action.needClip = true;
  }
  return action;
}

class TweenManager {
  tweenMap = new Map<string, { t: Tween; transient: boolean }>();

  add(t: Tween, transient = false) {
    if (!this.tweenMap.get(t.key())) {
      this.tweenMap.set(t.key(), { t, transient });
      t.hook('end', () => {
        this.remove(t.key());
      });
      return true;
    }
    return false;
  }

  get(key: string) {
    return this.tweenMap.get(key)?.t;
  }

  remove(key: string) {
    this.tweenMap.delete(key);
  }

  getAllUpdates(): Tween[] {
    const tweens = Array.from(this.tweenMap.values())
      .filter((item) => !item.transient)
      .map((item) => item.t);
    return tweens;
  }

  getAll(): Tween[] {
    const tweens = Array.from(this.tweenMap.values()).map((item) => item.t);
    return tweens;
  }

  removeAll(): Tween[] {
    const tweens = Array.from(this.tweenMap.values());
    this.tweenMap = new Map<string, { t: Tween; transient: boolean }>();
    return tweens.map((item) => item.t);
  }
}

interface TweensPatch {
  transients: Tween[];
  adds: Tween[];
  updates: [Tween, Tween][];
  removes: Tween[];
}

function diffTweens(olderTweens: Tween[], newerTweens: Tween[]) {
  const olderMap = new Map<string, Tween>();
  const newerMap = new Map<string, Tween>();
  const adds: Tween[] = [];
  const updates: [Tween, Tween][] = [];
  const removes: Tween[] = [];
  for (let i = 0; i < olderTweens.length; i++) {
    const t = olderTweens[i];
    olderMap.set(t.key(), t);
  }
  for (let i = 0; i < newerTweens.length; i++) {
    const t = newerTweens[i];
    newerMap.set(t.key(), t);
    if (!olderMap.get(t.key())) {
      adds.push(t);
    } else {
      updates.push([olderMap.get(t.key()) as Tween, t]);
    }
  }
  for (let i = 0; i < olderTweens.length; i++) {
    const t = olderTweens[i];
    if (!newerMap.get(t.key())) {
      removes.push(t);
    }
  }
  return {
    adds,
    updates,
    removes,
  };
}

// renderer实际是view层，处理数据显示和事件绑定
// app 是整个controller层
// graph struct是model层
// 所以整个core就是C+M，renderer是一个抽象view层，renderer实现层就是View+Event，renderer是否需要抽象一个事件模型，支持冒泡，取消？
// 渲染模块
// TODO 支持viewport 支持clip
// 动画要支持进入stage触发，还是进入viewport触发
// 动画也可以使用clip，根据动画的属性是否只有opacity，background来确定是否布局位置是不变的使用clip，减少动画执行计算
// 动画可以取消
// 应抽象Viewport Node
// 动画过程A -> B -> C；
// 增加viewport 移动到底的事件
export abstract class Renderer<T = void>
  extends Pluginable<Renderer<T>, KPlugin<Renderer<T>>, IRenderHook<T>>
  implements IRenderer<T>
{
  app: App<T>;

  root: RenderGraph = new RenderGraph();

  nextRoot: GraphStruct | undefined;

  tweenManager = new TweenManager();

  tweens: Tween[] = [];

  timeline: Timeline = new Timeline();

  raf: RafTicker = new RafTicker();

  viewportRect: Rect = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };

  scheduled = false;

  renderHint = 0;

  init(app: App<T>) {
    this.app = app;
    this.plugins.forEach((plugin) => {
      plugin.install(this);
    });
    this.raf.init();
  }

  updateViewport(v: Viewport) {
    this.viewportRect = {
      left: v.x,
      right: v.x + v.width,
      top: v.y,
      bottom: v.y + v.height,
      width: v.width,
      height: v.height,
    };
    this.scheduleRender(RenderHint.ViewportUpdate);
  }

  nextFrame(callback: (timestamp: number) => void) {
    const remove = this.raf.onTick((t) => {
      callback(t);
      remove();
    });
  }

  scheduleRender(hint: RenderHint, nextRoot?: GraphStruct): void {
    this.renderHint |= hint;
    if (nextRoot) {
      this.nextRoot = nextRoot;
    }
    if (!this.scheduled) {
      this.scheduled = true;
      this.nextFrame((timestamp) => {
        this.scheduled = false;
        this.render(timestamp);
        this.nextRoot = undefined;
      });
    }
  }

  private applyTweensPatch(patch: TweensPatch) {
    const addTween = (t: Tween, transient = false) => {
      const oldTween = this.tweenManager.get(t.key());
      if (oldTween && oldTween.config.to !== t.config.to) {
        this.tweenManager.remove(oldTween.key());
        oldTween.exit(this.timeline);
      }
      if (this.tweenManager.add(t, transient)) {
        t.join(this.timeline);
      }
    };
    patch.transients.forEach((t) => {
      addTween(t, true);
    });
    patch.adds.forEach((t) => {
      addTween(t, false);
    });
    patch.removes.forEach((t) => {
      this.tweenManager.remove(t.key());
      t.end(true);
    });
    patch.updates.forEach(([older, newer]) => {
      if (!older.compareConfig(newer.config)) {
        this.tweenManager.remove(older.config);
        older.end(false);
        if (this.tweenManager.add(newer)) {
          newer.join(this.timeline);
        }
      }
    });
  }

  private updatePropertiesFromTweens() {
    this.tweenManager.getAll().forEach((t) => {
      t.mutator(t.currentValue, t.config);
    });
  }

  // 需要更新动画绑定的render node
  private updateConfigOfTweens(root: RenderGraph) {
    this.tweenManager.getAll().forEach((t) => {
      const newNode = root.getNode(t.config.node.id);
      if (newNode) {
        t.config.node = newNode;
      }
    });
  }

  private computeTranistionFromConfig(config: ITransitionConfig, node: RenderNode): PropertyTransitionTween[] {
    const tweens: PropertyTransitionTween[] = [];
    Object.keys(config.from ?? {}).forEach((key) => {
      tweens.push(
        new PropertyTransitionTween(
          config.from?.[key],
          {
            node,
            delay: config.delay,
            duration: config.duration,
            property: key,
            from: config.from?.[key],
            to: config.to?.[key],
            easing: config.easing,
          },
          (v, conf) => {
            Object.assign(conf.node, { [key]: v });
          },
        ),
      );
    });
    return tweens;
  }

  private computeTransitionTweenFromMutation<T extends RenderNode | RenderLink>(
    m: ListMutation<T>,
    stage: number,
    type: 'link' | 'node',
  ) {
    const tweens: Tween[] = [];
    if (stage & AnimationStep.Enter) {
      m.adds.forEach((node) => {
        const configs: ITransitionConfig[] = [];
        node.transitions
          ?.filter((t) => t.trigger === 'enter')
          .forEach((t) => {
            configs.push(...t.configs);
          });

        configs.forEach((config) => {
          if (!isUndefined(config.from)) {
            // 必须要记录endState，因为动画结束的状态不一定就是节点最终的状态
            const endState = clonePropertiesFromObj(Object.keys(config.from), node);
            const to = config.to ?? endState;
            const ts = this.computeTranistionFromConfig(
              {
                ...config,
                to,
              },
              node,
            );
            tweens.push(...ts);
          }
        });
      });
    }
    if (stage & AnimationStep.Leave) {
      m.removes.forEach(({ node }) => {
        const configs: ITransitionConfig[] = [];
        node.transitions
          ?.filter((t) => t.trigger === 'leave')
          .forEach((t) => {
            configs.push(...t.configs);
          });
        configs.forEach((config) => {
          if (!isUndefined(config.to)) {
            const startState = clonePropertiesFromObj(Object.keys(config.to), node);
            const from = config.from ?? startState;
            const ts = this.computeTranistionFromConfig(
              {
                ...config,
                from,
              },
              node,
            );
            ts.forEach((t) => {
              t.hook('start', () => {
                const n = t.config.node;
                if (n) {
                  n.activeAnimations++;
                }
              });

              t.hook('end', () => {
                const n = t.config.node;
                if (n) {
                  if (n.activeAnimations) {
                    n.activeAnimations--;
                  }
                  if (n.activeAnimations === 0) {
                    // 从双连表移除
                    if (n.predecessor) {
                      n.predecessor.successor = n.successor;
                      if (n.successor) {
                        n.successor.predecessor = n.predecessor;
                      }
                      // 直接移除
                    } else if (type === 'node') {
                      this.root.removeNode(n.id);
                    } else {
                      this.root.removeLink(n.id);
                    }
                  }
                }
              });
            });

            tweens.push(...ts);
          }
        });
      });
    }
    if (stage & AnimationStep.Update) {
      m.updates.forEach(({ older, newer }) => {
        const configs: ITransitionConfig[] = [];
        older.transitions
          ?.filter((t) => t.trigger === 'update')
          .forEach((t) => {
            configs.push(...t.configs);
          });

        configs.forEach((config) => {
          if (!isUndefined(config.properties)) {
            const startState = clonePropertiesFromObj(config.properties, older);
            const endState = clonePropertiesFromObj(config.properties, newer);
            const [from, to] = diffProperties(startState, endState);
            const ts = this.computeTranistionFromConfig(
              {
                ...config,
                from,
                to,
              },
              newer,
            );
            tweens.push(...ts);
          } else {
            // 所有属性变化都得加入到动画
            const [from, to] = diffProperties(older, newer, (key) =>
              ['transitions', 'animations', 'id', 'alternate'].includes(key),
            );
            const ts = this.computeTranistionFromConfig(
              {
                ...config,
                from,
                to,
              },
              newer,
            );
            tweens.push(...ts);
          }
        });
      });
    }
    return tweens;
  }

  private computeTweensFromMutation(m: GraphMutation, stage: number): Tween[] {
    const tweens: Tween[] = [];
    const nodeTweens = this.computeTransitionTweenFromMutation(m.nodeMutation, stage, 'node');
    tweens.push(...nodeTweens);

    const linkTweens = this.computeTransitionTweenFromMutation(m.linkMutation, stage, 'link');
    tweens.push(...linkTweens);
    return tweens;
  }

  prepareToAnimate(root: RenderGraph, mutation: GraphMutation) {
    mutation.nodeMutation.removes.forEach(({ node, pos }) => {
      if (pos !== -1) {
        root.nodes.splice(pos, 0, node);
      }
    });
  }

  render(timestamp: number) {
    this.app.logger.info('%c[render] call', 'background: #13A10E; color: #fff');
    const renderAction = computeActionFromHint(this.renderHint);
    const needAnimationUpdate = this.timeline.needUpdate();
    this.call('beforeRender', this);
    const cleanup = this.hook('renderStage', (next) => {
      this.app.logger.info('%c[updateTimeline] call', 'background: #3B78FF; color: #fff');
      // 因为动画结束可能会删除节点也会对graph产生影响，促使在diff过程中又会产生新的动画
      this.timeline.update(timestamp);
      let { root } = this;
      if (renderAction.needNewRoot) {
        if (!this.nextRoot) {
          throw new Error('wooo! miss root');
        }
        root = RenderGraph.from(this.nextRoot);
      } else {
        root = root.clone();
      }
      // 触发update 需要先布局
      // 但是又需要加入要进行remove动画的节点，避免丢失节点
      // 解决必须先diff，patch remove节点
      const mutation = diffGraph(this.root, root);
      // root = applyPatchFromMutation(root, mutation);
      // layout阶段会覆盖之前的animation结果x
      if (renderAction.needLayout) {
        this.app.logger.info('%c[performLayout] call', 'background: #881798; color: #fff');
        this.callChain('performLayout', root, this);
      }
      // TODO 动画是否可以暂停, 但是leave动画是不可以暂停的
      if (renderAction.needAnimation) {
        this.prepareToAnimate(root, mutation);
        this.app.logger.info('%c[computeAnimation] call', 'background: #881798; color: #fff');
        this.updateConfigOfTweens(root);
        const transientTweens = this.computeTweensFromMutation(mutation, AnimationStep.Enter | AnimationStep.Leave);
        const updatedTweens = this.computeTweensFromMutation(mutation, AnimationStep.Update);
        const patch = diffTweens(this.tweenManager.getAllUpdates(), updatedTweens);
        this.applyTweensPatch({ ...patch, transients: transientTweens });
      }
      this.updatePropertiesFromTweens();
      let clipedRoot = this.root;
      if (renderAction.needClip) {
        // 因为clip过程只会减少节点不会改变节点布局，所以做浅复制就好了
        clipedRoot = this.root.shallowClone();
        this.app.logger.info('%c[peformClip] call', 'background: #3B78FF; color: #fff');
        clipedRoot = this.callChain('performClip', clipedRoot, this) ?? clipedRoot;
      }

      this.app.logger.info('%c[performRender] call', 'background: cyan; color: #000');
      // 更新root
      this.root = root;
      const result = this.callChain('performRender', clipedRoot, this);
      return result as T;
    });
    this.app.logger.info('%c[renderStage] call', 'background: #C19C00; color: #fff');
    const stage = this.callChain('renderStage', this) as T;
    cleanup();

    this.renderHint = 0;
    this.app.logger.info('%c[onRender] call', 'background: #3B78FF; color: #fff');
    this.call('onRender', stage, this);

    // 1. 动画存在
    // 2. 前一帧有动画存在，这一帧刚好动画结束，可能需要重新布局
    if (this.timeline.needUpdate() || needAnimationUpdate) {
      this.app.logger.info('%c[scheduleRender] call', 'background: #C50F1F; color: #fff');
      this.scheduleRender(RenderHint.AnimationUpdate);
    }
    return stage;
  }

  protected callChain<E extends keyof IRenderHook<T>>(
    event: E,
    ...args: Shift<Parameters<IRenderHook<T>[E]>>
  ): ReturnType<IRenderHook<T>[E]> | void {
    const fns = this.emitter.get(event) as ReturnType<IRenderHook<T>[E]>[];
    if (fns) {
      let i = 0;
      const next = () => {
        if (i >= fns.length) {
          return;
        }
        // @ts-ignore
        // eslint-disable-next-line
        return fns[i++](next, ...args);
      };
      return next();
    }
    return undefined;
  }

  beforeRender(callback: IRenderHook<T>['beforeRender']): () => void {
    return this.hook('beforeRender', callback);
  }

  onRender(callback: IRenderHook<T>['onRender']): () => void {
    return this.hook('onRender', callback);
  }

  onRenderStage(callback: IRenderHook<T>['renderStage']): () => void {
    return this.hook('renderStage', callback);
  }

  onRenderNode(callback: IRenderHook<T>['renderNode']): () => void {
    return this.hook('renderNode', callback);
  }

  onRenderLink(callback: IRenderHook<T>['renderLink']): () => void {
    return this.hook('renderLink', callback);
  }

  onPerformLayout(callback: IRenderHook<T>['performLayout']): () => void {
    return this.hook('performLayout', callback);
  }

  onPerformRender(callback: IRenderHook<T>['performRender']): () => void {
    return this.hook('performRender', callback);
  }
}
