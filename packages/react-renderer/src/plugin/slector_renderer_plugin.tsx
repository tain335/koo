import React from 'react';
import { RendererPlugin, RendererHost, NodeId } from 'core';

declare module 'core' {
  export interface AppState {
    selectNodeId?: NodeId;
  }
  export interface IAppHook {
    selectNode: (nodeId: NodeId) => void;
  }
}

export class SelectorRenderPlugin implements RendererPlugin<React.ReactNode> {
  install(host: RendererHost<React.ReactNode>): void | (() => void) {
    const cancel = host.onRenderNode((next, node, renderer) => {
      const selected = renderer.app.state.selectNodeId === node.id;
      return (
        <div
          style={{
            transform: 'translateZ(0)',
            border: '1px solid #000',
            outlineColor: 'green',
            outlineWidth: selected ? 2 : 0,
            outlineStyle: 'dashed',
            opacity: node.opacity,
            height: node.height,
            position: 'absolute',
            top: node.y + node.offsetY,
            left: node.x + node.offsetX,
            overflow: 'hidden',
          }}
          onClick={() => renderer.app.call('selectNode', node.id)}
          key={node.id}
        >
          Selector{next()}
        </div>
      );
    });
    host.app.hook('selectNode', (nodeId) => {
      host.app.state.selectNodeId = nodeId;
      host.app.update(false);
    });
    return () => {
      cancel();
    };
  }
}
