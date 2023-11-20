import { isNumber } from 'lodash';
import { ILayout } from './ILayout';
import { RenderGraph } from '../renderer/render_graph';

export class LinearLayout implements ILayout {
  constructor(public root: RenderGraph, public direction: 'vertical' | 'horizontal' = 'vertical') {}

  perform() {
    const nodes = this.root.getNodes();
    let nextPos = 0;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (this.direction === 'vertical') {
        node.y = nextPos;
        node.rect.top = node.y;
        node.rect.bottom = node.y + node.height;
        node.updateSuccessors((n) => {
          n.y = nextPos;
          n.rect.top = n.y;
          n.rect.bottom = n.y + node.height;
        });
        if (isNumber(node.height)) {
          nextPos += node.height;
        } else {
          nextPos += 0;
        }
      }
    }
  }
}
