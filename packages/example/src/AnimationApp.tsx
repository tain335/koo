import React, { useEffect, useRef, useState } from 'react';
import { App, GraphNode } from 'core';
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
            // opacity: 0,
            offsetX: 300,
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
            // opacity: 0,
            offsetX: -300,
          },
        },
      ],
    },
  );
  return node;
}

const renderer = new ReactRenderer();
renderer.use(new LayoutRendererPlugin(), new SelectorRenderPlugin(), new NodeRenderPlugin());
const app = new App({
  renderer,
});
app.afterInit((app) => {
  app.state.data.root.transaction((data) => {
    for (let i = 0; i < 1; i++) {
      const node = createNode();
      data.addNode(node);
    }
  });
});
export function AnimationApp() {
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
      <div>
        <button
          type="button"
          onClick={() => {
            app.state.data.root.transaction((data) => {
              const node = createNode();
              data.addNode(node);
            });
            app.update();
          }}
        >
          add
        </button>
        <button
          type="button"
          onClick={() => {
            app.state.data.root.transaction((data) => {
              const nodes = data.getNodes();
              const idx = Math.floor(nodes.length * Math.random());
              if (nodes.length) {
                data.removeNode(nodes[idx].id);
              }
            });
            app.update();
          }}
        >
          remove
        </button>
        <button
          type="button"
          onClick={() => {
            app.state.data.root.transaction((data) => {
              const nodes = data.getNodes();
              const index = Math.floor(nodes.length * Math.random());
              nodes[index] = createNode();
            });
            app.update(true);
          }}
        >
          replace
        </button>
        <button
          type="button"
          onClick={() => {
            app.state.data.root.transaction((data) => {
              const nodes = data.getNodes();
              for (let i = 0; i < nodes.length; i++) {
                const nextIndex = i + Math.floor((nodes.length - i) * Math.random());
                const tmp = nodes[i];
                nodes[i] = nodes[nextIndex];
                nodes[nextIndex] = tmp;
              }
            });
            app.update(true);
          }}
        >
          shuffle
        </button>
      </div>
    </>
  );
}
