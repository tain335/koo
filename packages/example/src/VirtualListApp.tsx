import React, { useEffect, useRef, useState } from 'react';
import { App, GraphNode, ClipRendererPlugin } from 'core';
import { LayoutRendererPlugin, SelectorRenderPlugin, NodeRenderPlugin, ReactRenderer } from 'react-renderer';

function createNode() {
  const node = new GraphNode();
  node.height = 60;
  node.transitions.push(
    {
      trigger: 'enter',
      configs: [
        {
          delay: 0,
          duration: 300,
          easing: 'ease-in',
          from: {
            opacity: 0,
          },
        },
      ],
    },
    {
      trigger: 'update',
      configs: [
        {
          delay: 0,
          duration: 300,
          easing: 'ease-in',
          properties: ['y'],
        },
      ],
    },
    {
      trigger: 'leave',
      configs: [
        {
          delay: 0,
          duration: 300,
          easing: 'ease-in',
          to: {
            opacity: 0,
          },
        },
      ],
    },
  );
  return node;
}

const renderer = new ReactRenderer();
renderer.use(new LayoutRendererPlugin(), new SelectorRenderPlugin(), new NodeRenderPlugin(), new ClipRendererPlugin());
const app = new App({
  renderer,
});
app.afterInit((app) => {
  app.state.data.root.transaction((data) => {
    for (let i = 0; i < 100; i++) {
      const node = createNode();
      data.addNode(node);
    }
  });
});
export function VirtualListApp() {
  const [content, setContent] = useState<React.ReactNode>();
  const elRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    app.init(elRef.current as HTMLElement);
    const cleanup = app.renderer.onRender((stage) => {
      setContent(stage);
    });
    return () => cleanup();
  }, []);
  return (
    <>
      <div ref={elRef}>{content}</div>
    </>
  );
}
