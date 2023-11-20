import React from 'react';
import { RendererHost, RendererPlugin } from 'core';

export class NodeRenderPlugin implements RendererPlugin<React.ReactNode> {
  install(host: RendererHost<React.ReactNode>): void | (() => void) {
    const cancel = host.onRenderNode((next, node, renderer) => {
      return (
        <div
          key={node.id}
          style={{
            border: '1px solid #000',
          }}
        >
          {node.id}
          {next()}
        </div>
      );
    });
    return () => {
      cancel();
    };
  }
}
