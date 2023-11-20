import { isNumber } from 'lodash';
import { Rect } from './rect';
import { GraphLink, GraphNode, GraphStruct } from '../app/graph';
import { OpRecord } from '../app/op';
import { IGraph, INode, NodeId } from '../data/define';

// TODO
// 增加setX, setY, setWidth, setHeight 同时update rect的方法
// rotate, scale, tranlate = matrix
// RnderNode跟Node的最大区别就是 x, y就是实际的布局坐标；而Node的x, y可以是实际坐标，也可以是相对父级的，根据具体布局上下文而定
// 因为RenderNode是实际的布局坐标所以很容易实现各种动画，因为动画过渡就会存在中间态，这个时候就会出现add，update, remove都会同时存在的情况，这时候如果还依赖布局上下文就会出现冲突
export class RenderNode extends GraphNode {
  width = 0;

  height = 0;

  rect: Rect = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };

  config: GraphNode;

  successor?: RenderNode; // 当删除节点有动画且删除元素原本位置有新的节点替换，会指被删除的节点，而新的节点要等删除节点动画结束才会加入到节点列表

  predecessor?: RenderNode;

  activeAnimations = 0;

  static from(gn: GraphNode): RenderNode {
    const n = new RenderNode();
    n.id = gn.id;
    n.animations = gn.animations;
    n.transitions = gn.transitions;
    n.bacgroundColor = gn.bacgroundColor;
    n.color = gn.color;
    n.height = getNodeHeight(gn);
    n.width = getNodeWidth(gn);
    n.opacity = gn.opacity;
    n.matrix = gn.matrix;
    n.x = gn.x;
    n.y = gn.y;
    n.config = gn;
    n.rect = { left: n.x, right: n.x + n.width, top: n.y, bottom: n.y + n.height, width: n.width, height: n.height };
    return n;
  }

  clone(cloned = new RenderNode()): RenderNode {
    super.clone(cloned);
    cloned.activeAnimations = this.activeAnimations;
    cloned.successor = this.successor;
    if (this.successor) {
      this.successor.predecessor = cloned;
    }
    cloned.rect = this.rect;
    return cloned;
  }

  getSuccessors() {
    const successors: (typeof this)[] = [];
    let n = this.successor;
    while (n) {
      successors.push(n as typeof this);
      n = n.successor;
    }
    return successors;
  }

  updateSuccessors(mutator: (node: typeof this) => void) {
    let n = this.successor;
    while (n) {
      mutator(n as typeof this);
      n = n.successor;
    }
  }

  hasLeavingTweens() {
    return (
      this.transitions.some((config) => config.trigger === 'leave') ||
      this.animations.some((config) => config.trigger === 'leave')
    );
  }
}

export class RenderLink extends RenderNode {
  config: RenderLink;

  nodes: [string, string];

  successor?: RenderLink;

  predecessor?: RenderLink;

  static from(gl: GraphLink): RenderLink {
    const l = new RenderLink();
    l.id = gl.id;
    l.nodes = gl.nodes;
    l.animations = gl.animations;
    l.transitions = gl.transitions;
    l.bacgroundColor = gl.bacgroundColor;
    l.color = gl.color;
    l.opacity = gl.opacity;
    l.matrix = gl.matrix;
    return l;
  }

  clone(cloned: RenderLink = new RenderLink()): RenderLink {
    super.clone(cloned);
    cloned.nodes = this.nodes;
    cloned.successor = this.successor;
    if (this.successor) {
      this.successor.predecessor = cloned;
    }
    return cloned;
  }
}

function getNodeWidth(node: INode) {
  return isNumber(node.width) ? node.width : 0;
}

function getNodeHeight(node: INode) {
  return isNumber(node.height) ? node.height : 0;
}

class RendererEvent {
  name: string;

  target: RenderNode;

  currentTarget: RenderNode;

  paths: RenderNode[];

  nativeEvent: Event;

  stopPropgation() {}

  preventDefault() {
    this.nativeEvent.preventDefault();
  }
}

// render object
// 在动画过程中会出现一种中间态 就是移除的节点，还得保留在列表中必须得等动画完成才可以移除
// 提供一个迭代方法 提供绝对位置index 和 相对位置index
export class RenderGraph extends GraphStruct<RenderNode, RenderLink> {
  static from(graph: GraphStruct<GraphNode, GraphLink>): RenderGraph {
    const nodes = graph.getNodes();
    const links = graph.getLinks();

    const g = new RenderGraph();
    g.nodes = nodes.map((n) => {
      return RenderNode.from(n as GraphNode);
    });
    g.links = links.map((l) => {
      const newLink = RenderLink.from(l);
      const from = g.getNode(newLink.nodes[0]) as INode;
      const to = g.getNode(newLink.nodes[1]) as INode;
      newLink.x = from.x + getNodeWidth(from) / 2;
      newLink.y = from.y + getNodeHeight(from) / 2;
      newLink.width = Math.abs(from.x + getNodeWidth(from) / 2 - (to.x + getNodeWidth(to) / 2));
      newLink.height = Math.abs(from.y + getNodeHeight(from) / 2 - (to.y + getNodeHeight(to) / 2));
      return newLink;
    });
    return g;
  }

  getNode(id: string): void | RenderNode {
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (node.id === id) {
        return node;
      }
    }
    return undefined;
  }

  getLink(id: string): void | RenderLink {
    for (let i = 0; i < this.links.length; i++) {
      const link = this.links[i];
      if (link.id === id) {
        return link;
      }
    }
    return undefined;
  }

  transaction(callback: (data: IGraph) => void): OpRecord {
    throw new Error('no implement');
  }

  clone(): RenderGraph {
    const g = new RenderGraph();
    super.clone(g);
    return g;
  }

  shallowClone(): RenderGraph {
    const g = new RenderGraph();
    g.nodes = this.nodes.slice();
    g.links = this.links.slice();
    return g;
  }

  // 必须只能使用nodeId，因为渲染时候是clippedRoot
  emit(nodeId: NodeId, event: string, ...args: any[]) {}
}
