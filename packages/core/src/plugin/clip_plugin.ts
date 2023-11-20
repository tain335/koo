import { intersect } from '../renderer/rect';
import { RendererHost, RendererPlugin } from '../renderer/renderer';

export class ClipRendererPlugin implements RendererPlugin<any> {
  install(host: RendererHost<any>): void {
    host.hook('performClip', (next, graph) => {
      const nodes = graph.getNodes();
      const links = graph.getLinks();
      const { viewportRect } = host;

      graph.nodes = nodes.filter((n, index) => {
        return intersect(viewportRect, n.rect);
      });
      graph.links = links.filter((l) => {
        return intersect(viewportRect, l.rect);
      });
      return graph;
    });
  }
}
