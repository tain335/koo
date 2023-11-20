import { easeSinIn } from 'd3-ease';
import { isArray, isNumber, isString } from 'lodash';
import parseColor from 'parse-color';
import { Matrix, compose, decomposeTSR, rotate, scale, translate } from 'transformation-matrix';
import { EventHook } from '../event/event';
import { computeFromRange, computeValuesFromRange, normalize } from '../utils/utils';
import { RenderNode } from 'src/renderer/render_graph';

type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
// 这里要抽象出PropertyTransition，因为需要精确对比属性动画参数又没有改变，如果改变了要立马停止现在动画执行新的动画
// 而且动画列表也要进行diff，来确定有没有新动画发生
// Transition对比
// TODO: iteration / fill mode / speed / direction
export interface ITransitionConfig<T extends { [key: string]: any } = { [key: string]: any }> {
  delay: number;

  duration: number;

  easing: Easing;

  properties?: string[];

  from?: T;

  to?: T;
}

export interface IPropertyTransitionConfig<T extends string | number | Matrix> {
  node: RenderNode;

  delay: number;

  duration: number;

  easing: Easing;

  property: string;

  from: T;

  to: T;
}

export interface IAnimationFrame {
  progress?: number;

  easing?: Easing;

  properties?: { [key: string]: any };
}

export interface IAnimationConfig {
  duration: number;

  delay: number;

  frames: IAnimationFrame[];
}

interface ITimelineHook {
  update: (value: number) => void;
}

interface ITimelineNode {
  update: (timelineValue: number) => void;
}

export interface ITweenTransitionConfig<T extends { [key: string]: any } = { [key: string]: any }>
  extends Exclude<ITransitionConfig<T>, 'properties'> {
  from: T;
  to: T;
}

interface ITweenHook<T> {
  join: () => void;
  start: () => void;
  end: () => void;
  pause: () => void;
  resume: () => void;
  progress: (p: number) => void;
  change: (v: T) => void;
}

export abstract class Tween<T = number, K = any> extends EventHook<ITweenHook<T>> implements ITimelineNode {
  status: 'start' | 'end' | 'pause' | 'join' | 'progress' = 'join';

  joinStart = -1;

  active = true;

  tweens: Tween[] = [];

  progress = 0;

  currentValue: T;

  constructor(initialValue: T, public config: K, public mutator: (data: T, config: K) => void) {
    super();
    this.currentValue = initialValue;
  }

  after(...tweens: Tween[]) {
    this.tweens.push(...tweens);
  }

  pause() {
    this.active = false;
    this.call('pause');
    this.tweens.forEach((t) => {
      t.pause();
    });
  }

  resume() {
    this.active = true;
    this.call('resume');
    this.tweens.forEach((t) => {
      t.resume();
    });
  }

  key(): string {
    throw new Error('no implement');
  }

  compareConfig(newConfig: K): boolean {
    throw new Error('no implement');
  }

  updateProgress(tv: number): number {
    throw new Error('no implement');
  }

  updateValue(progress: number): T {
    throw new Error('no implement');
  }

  update(tv: number) {
    if (this.progress === 0) {
      this.call('start');
    }
    this.progress = this.updateProgress(tv);
    this.call('progress', this.progress);
    this.currentValue = this.updateValue(this.progress);
    this.mutator(this.currentValue, this.config);
    this.call('change', this.currentValue);
    if (this.status === 'end') {
      this.call('end');
    }
    if (this.progress === 1) {
      // 下一帧才触发end事件
      this.status = 'end';
    }
  }

  end(updateProgress: boolean) {
    if (updateProgress) {
      this.progress = 1;
      this.currentValue = this.updateValue(1);
      this.mutator(this.currentValue, this.config);
    }
    this.status = 'end';
    this.call('end');
  }

  join(t: Timeline) {
    this.joinStart = t.value;
    // 更新初始值
    this.mutator(this.currentValue, this.config);
    this.call('join');
    t.add(this);
    this.hook('end', () => {
      // 看情况是否需要移除, scroll timeline不需要移除
      t.remove(this);
      this.tweens.forEach((tween) => {
        tween.join(t);
      });
    });
  }

  exit(t: Timeline) {
    this.pause();
    t.remove(this);
    this.tweens.forEach((tween) => {
      t.remove(tween);
    });
  }

  // repeat() {}

  // yoyo() {}

  // delay() {}
}

export class PropertyAnimationTween<T> extends Tween<T> {
  constructor(initialValue: T, config: IAnimationConfig, mutator: (data: T) => void) {
    super(initialValue, config, mutator);
  }

  update(timeline: number): void {}
}

function computeProperty(fromVal: any, toVal: any, fraction: number): any {
  if (isNumber(fromVal)) {
    return computeFromRange(fromVal as number, toVal as number, fraction);
  }
  if (isString(fromVal)) {
    const fromColor = parseColor(fromVal as string);
    const toColor = parseColor(toVal as string);
    if (fromColor.rgba && toColor.rgba) {
      const newColor = computeValuesFromRange(fromColor.rgba, toColor.rgba, fraction);
      return `rgba(${newColor[0]},${newColor[1]},${newColor[2]},${newColor[3]})`;
    }
    return toVal;
  }
  if (isArray(fromVal)) {
    // 所有都是数字可以认为是matrix
    if (fromVal.every((n: any) => isNumber(n))) {
      // @ts-ignore
      const fromTransform = decomposeTSR(fromVal);
      const toTransform = decomposeTSR(toVal);
      const angle = computeFromRange(fromTransform.rotation.angle, toTransform.rotation.angle, fraction);
      const scaleX = computeFromRange(fromTransform.scale.sx, toTransform.scale.sx, fraction);
      const scaleY = computeFromRange(fromTransform.scale.sy, toTransform.scale.sy, fraction);
      const translateX = computeFromRange(fromTransform.translate.tx, toTransform.translate.tx, fraction);
      const translateY = computeFromRange(fromTransform.translate.ty, toTransform.translate.ty, fraction);
      return compose(rotate(angle), scale(scaleX, scaleY), translate(translateX, translateY));
    }
    // @ts-ignore
    return fromVal.map((v, index) => computeProperty(v, toVal[index], fraction));
  }
  throw new Error('no implement type');
}

export class PropertyTransitionTween<T extends string | number | Matrix = number> extends Tween<
  T,
  IPropertyTransitionConfig<T>
> {
  constructor(
    initailValue: T,
    config: IPropertyTransitionConfig<T>,
    mutator: (data: T, config: IPropertyTransitionConfig<T>) => void,
  ) {
    super(initailValue, config, mutator);
  }

  key(): string {
    return `${this.config.node.id}.${this.config.property}`;
  }

  updateProgress(tv: number): number {
    return normalize((tv - this.joinStart - this.config.delay) / this.config.duration);
  }

  updateValue(progress: number): T {
    const v = easeSinIn(progress);
    const newPropertyValue = computeProperty(this.config.from, this.config.to, v);
    return newPropertyValue;
  }

  compareConfig(newConfig: IPropertyTransitionConfig<T>): boolean {
    return this.config.to === newConfig.to;
  }
}

// scroll timeline/normal timeline
export class Timeline extends EventHook<ITimelineHook> {
  start = -1;

  value = 0;

  nodes: ITimelineNode[] = [];

  constructor() {
    super();
    this.hook('update', (v) => {
      this.nodes.forEach((n) => {
        n.update(v);
      });
    });
  }

  add(node: ITimelineNode) {
    this.nodes.push(node);
  }

  remove(node: ITimelineNode) {
    const idx = this.nodes.findIndex((n) => n === node);
    if (idx !== -1) {
      this.nodes.splice(idx, 1);
    }
  }

  update(t: number) {
    this.value = t;
    this.call('update', t);
  }

  activate() {}

  inactivate() {}

  onUpdate(callback: ITimelineHook['update']) {
    this.hook('update', callback);
  }

  needUpdate() {
    return Boolean(this.nodes.length);
  }
}

export class ScrollTimeline extends Timeline {}

// Timeline -> Animation -> Tween
export class Animation {
  constructor(public root: Tween, public timeline: Timeline) {}

  stop() {
    this.root.exit(this.timeline);
  }

  pause() {
    this.root.pause();
  }

  resume() {
    this.root.resume();
  }

  start() {
    this.root.join(this.timeline);
  }
}
