import { LinearLayout, RendererHost, RendererPlugin } from 'core';

export class LayoutRendererPlugin implements RendererPlugin<React.ReactNode> {
  install(host: RendererHost<React.ReactNode>): void {
    host.onPerformLayout((next, root) => {
      const linearLayout = new LinearLayout(root);
      return linearLayout.perform();
    });
  }
}
