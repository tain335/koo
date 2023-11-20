import React, { Fragment, useEffect, useRef } from 'react';
import { App, Renderer, Viewport, Rect, RenderNode } from 'core';
// <PluginA>
//  <PluginB>
//    <Node></Node>
//  </PluginB>
// </PluginB>
// <PluginA>
//  <PluginB>
//    <Link></Link>
//  </PluginB>
// </PluginB>

interface StageProps {
  style?: React.CSSProperties;
  children?: React.ReactNode;
  scrollHeight?: number;
  viewportRect: Rect;
  onViewportUpdate: (v: Viewport) => void;
}

function Stage({ onViewportUpdate, style, children, viewportRect, scrollHeight = 0 }: StageProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    onViewportUpdate?.({
      x: 0,
      y: 0,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    });
  }, []);
  return (
    <div
      ref={ref}
      style={style}
      onScroll={(event) => {
        onViewportUpdate({
          x: viewportRect.left,
          y: ref.current?.scrollTop ?? 0,
          width: viewportRect.width,
          height: viewportRect.height,
        });
      }}
    >
      <div style={{ position: 'relative', height: scrollHeight }}>{children}</div>
    </div>
  );
}

function computeCanvasWH(nodes: RenderNode[]) {
  let width = 0;
  let height = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    width = Math.max(n.x + n.width, width);
    height = Math.max(n.y + n.height, height);
  }
  return {
    width,
    height,
  };
}

export class ReactRenderer extends Renderer<React.ReactNode> {
  init(app: App<React.ReactNode>): void {
    super.init(app);
    this.hook('renderStage', (next, renderer) => {
      const nodes = renderer.root.getNodes();
      const { height } = computeCanvasWH(nodes);
      return (
        <Stage
          style={{ position: 'relative', height: 400, overflow: 'auto' }}
          scrollHeight={height}
          viewportRect={this.viewportRect}
          onViewportUpdate={(viewport) => {
            app.renderer.updateViewport(viewport);
          }}
        >
          {next()}
        </Stage>
      );
    });
    this.hook('performRender', (next, renderGraph, renderer) => {
      const { nodes, links } = renderGraph;
      const linkEls = links.map((link) => {
        return this.callChain('renderLink', link, renderer);
      });
      const nodeEls = nodes.map((node) => {
        const nodeEl = this.callChain('renderNode', node, renderer);
        const successors = node.getSuccessors();
        if (successors.length) {
          const els = successors.map((successor) => {
            return this.callChain('renderNode', successor, renderer);
          });
          return (
            <Fragment key={`${node.id}_${successors.map((s) => s.id).join('_')}`}>
              {els}
              {nodeEl}
            </Fragment>
          );
        }
        return nodeEl;
      });
      return (
        <>
          {nodeEls}
          {linkEls}
        </>
      );
    });
  }
}
