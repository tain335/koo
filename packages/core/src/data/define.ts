import { Matrix } from 'transformation-matrix';
import { OpRecord } from '../app/op';
import { Command } from '../command/command';
import { IAnimationConfig, ITransitionConfig } from '../animation/animation';
import { RenderLink, RenderNode } from '../renderer/render_graph';

export interface AppData {
  [key: string]: any;
  root: IGraph;
}

export interface AppState {
  version: number;
  commandStack: Command[];
  batchCommand: boolean;
  data: AppData;
}

export class NodeTransition {
  // enter leave update all
  // 不要render层支持click trigger，应该在逻辑层触发动画
  trigger: 'enter' | 'leave' | 'update';

  configs: ITransitionConfig[] = [];
}

export class NodeAnimation {
  // click enter leave
  trigger: 'enter' | 'leave' | 'update';

  configs: IAnimationConfig[] = [];
}

export interface INode {
  id: string;
  x: number;
  y: number;
  width: number | 'string';
  height: number | 'string';
  opacity: number;
  transitions: NodeTransition[];
  animations: NodeAnimation[];
  matrix: Matrix;
  _ro?: RenderNode;
  clone(cloned?: INode): INode;
}

export interface ILink extends Partial<Omit<INode, '_ro'>> {
  id: string;
  nodes: [NodeId, NodeId];
  _ro?: RenderLink;
}

export type NodeId = string;
export type LinkId = string;

// 通用图形结构，为什么需要通用图形结构，因为图形结构可以覆盖树，图，链表结构，且可以保持api更加稳定
// 用不可变结构，但是考虑到协作就仍然记录操作，为什么基于操作而不基于命令，因为图形结构操作会更加稳定，命令操作变化多
// 不可变结构可以用在过渡场景 / 或者使用snapshot
export interface IGraph<N extends INode = INode, L extends ILink = ILink> {
  getNodes(): N[];
  addNode(node: N): void;
  insertNode(node: N, pos: number): void;
  removeNode(id: NodeId): void;
  getParents(id: NodeId): N[];
  getNode(id: NodeId): N | void;
  getChildren(id: NodeId): N[];
  replaceNode(older: N, newer: N): void;
  cloneNode(node: N): N;
  getLink(id: LinkId): L | void;
  getLinks(): L[];
  addLink(nodeId1: NodeId, nodeId2: NodeId): void;
  insertLink(node: L, pos: number): void;
  removeLink(id: LinkId): void;
  getNodeLinks(id: NodeId): L[];
  getNodeRelatedLinks(id: NodeId): L[];
  replaceLink(link1: L, link2: L): void;
  cloneLink(link: L): L;
  transaction(callback: (data: IGraph) => void): OpRecord;
  rollback(): void;
  applyOp(name: keyof this, args: any): void;
  clone(): IGraph;
}
