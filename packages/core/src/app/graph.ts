import { nanoid } from 'nanoid';
import { scale, rotate, translate, compose, Matrix, identity } from 'transformation-matrix';
import { NopRecorder, OpRecord, OpRecorder } from './op';
import { IGraph, INode, ILink, NodeId, LinkId, NodeAnimation, NodeTransition } from '../data/define';

export class GraphNode implements INode {
  id: string = nanoid();

  x = 0;

  y = 0;

  offsetX = 0;

  offsetY = 0;

  width: number | 'string' = 0;

  height: number | 'string' = 0;

  transitions: NodeTransition[] = [];

  animations: NodeAnimation[] = [];

  opacity = 1;

  bacgroundColor = '#fff';

  color = '#000';

  matrix: Matrix = identity();

  rotate(angle: number, cx?: number, cy?: number) {
    this.matrix = compose(this.matrix, rotate(angle, cx, cy));
  }

  translate(x: number, y: number) {
    this.matrix = compose(this.matrix, translate(x, y));
  }

  sacle(x: number, y: number) {
    this.matrix = compose(this.matrix, scale(x, y));
  }

  clone(cloned: GraphNode = new GraphNode()): GraphNode {
    cloned.id = this.id;
    cloned.x = this.x;
    cloned.y = this.y;
    cloned.width = this.width;
    cloned.height = this.height;
    cloned.transitions = this.transitions;
    cloned.animations = this.animations;
    cloned.opacity = this.opacity;
    cloned.bacgroundColor = this.bacgroundColor;
    cloned.color = this.color;
    cloned.matrix = this.matrix;
    return cloned;
  }
}

export class GraphLink extends GraphNode implements ILink {
  nodes: [string, string];

  clone(cloned: GraphLink = new GraphLink()): GraphLink {
    super.clone(cloned);
    cloned.nodes = this.nodes;
    return cloned;
  }
}

export class GraphStruct<N extends GraphNode = GraphNode, L extends GraphLink = GraphLink> implements IGraph<N, L> {
  nodes: N[] = [];

  links: L[] = [];

  constructor(private recorder: OpRecorder = new NopRecorder()) {}

  getParents(id: NodeId): N[] {
    const links = this.links.filter((l) => l.nodes[1] === id);
    return links.map((link) => this.getNode(link.nodes[1])).filter(Boolean) as N[];
  }

  getNodes(): N[] {
    return this.nodes;
  }

  getChildren(id: NodeId): N[] {
    const links = this.links.filter((link) => link.nodes[0] === id);
    return links.map((link) => this.getNode(link.nodes[1])).filter(Boolean) as N[];
  }

  addNode(node: N): void {
    this.recorder.record(['addNode', node], ['removeNode', node.id]);
    this.nodes.push(node);
  }

  insertNode(node: N, pos: number): void {
    if (pos > this.nodes.length) {
      throw new Error('pos cannot lager than nodes.length');
    }
    this.nodes.splice(pos, 0, node);
  }

  removeNode(id: NodeId): void {
    const node = this.getNode(id);
    const index = this.nodes.findIndex((node) => node.id === id);
    if (index !== -1) {
      this.recorder.record(['removeNode', id], ['addNode', node]);
      this.nodes.splice(index, 1);
    }
  }

  getNode(id: NodeId): N | void {
    return this.nodes.find((node) => node.id === id);
  }

  replaceNode(older: N, newer: N): void {
    const index = this.nodes.findIndex((node) => node.id === older.id);
    if (index !== -1) {
      this.recorder.record(['replaceNode', older, newer], ['replaceNode', newer, older]);
      this.nodes[index] = newer;
    }
  }

  cloneNode(node: N): N {
    return { ...node };
  }

  addLink(nodeIdA: NodeId, nodeIdB: NodeId): void {
    let exist = false;
    for (let i = 0; i < this.links.length; i++) {
      const link = this.links[i];
      if (link.nodes[0] === nodeIdA && link.nodes[1] === nodeIdB) {
        exist = true;
        break;
      }
    }
    if (!exist) {
      this.links.push({ id: nanoid(), nodes: [nodeIdA, nodeIdB] } as L);
      this.recorder.record(['addLink', nodeIdA, nodeIdB], ['removeLink', `${nodeIdA}_${nodeIdB}`]);
    }
  }

  removeLink(id: LinkId): void {
    const link = this.getLink(id);
    const index = this.links.findIndex((l) => l === link);
    if (index !== -1) {
      this.recorder.record(['removeLink', id], ['addLink', link]);
      this.links.splice(index, 1);
    }
  }

  getNodeLinks(id: NodeId): L[] {
    return this.links.filter((link) => link.nodes[0] === id);
  }

  getNodeRelatedLinks(id: NodeId): L[] {
    return this.getNodeLinks(id).concat(this.links.filter((link) => link.nodes[1] === id));
  }

  replaceLink(older: L, newer: L): void {
    this.recorder.record(['replaceLink', older, newer], ['replaceLink', newer, older]);
    const index = this.links.findIndex((l) => l.id === older.id);
    if (index !== -1) {
      this.links[index] = newer;
    }
  }

  insertLink(link: L, pos: number): void {
    if (pos > this.links.length) {
      throw new Error('pos cannot lager than nodes.length');
    }
    this.links.splice(pos, 0, link);
  }

  getLink(id: string): L | void {
    return this.links.find((l) => l.id === id);
  }

  getLinks(): L[] {
    return this.links;
  }

  cloneLink(link: L): L {
    return { ...link };
  }

  applyOp(name: keyof this, args: any) {
    // eslint-disable-next-line
    const op = this[name] as Function;
    op.apply(this, args);
  }

  rollback() {
    const opRecord = this.recorder.stopRecorder();
    opRecord.undoOps.forEach((op) => {
      this.applyOp(op[1], op.slice(1));
    });
  }

  transaction(callback: (data: IGraph) => void): OpRecord {
    this.recorder.startRecorder();
    try {
      callback(this);
    } catch (err) {
      // 如果多人协作的时候redo undo有可能因为基于的状态跟当前状态不一致导致出错，所以这个时候只能回滚状态
      this.rollback();
      throw err;
    }
    return this.recorder.stopRecorder();
  }

  clone(cloned = new GraphStruct<N, L>()): IGraph<N, L> {
    cloned.nodes = this.nodes.map((n) => n.clone() as N);
    cloned.links = this.links.map((l) => l.clone?.() as L);
    return cloned;
  }
}
