// React Flow's stock look, re-pointed at the app's colour tokens so the canvas follows light
// and dark mode like the rest of the app. Scoped to .lab-canvas and injected by the Lab, so the
// app's global stylesheet stays free of canvas details.
export const LAB_CSS = `
.lab-canvas .react-flow {
  --xy-background-color: var(--canvas);
  --xy-edge-stroke: var(--muted);
  --xy-edge-stroke-width: 1.5;
  --xy-edge-stroke-selected: var(--accent);
  --xy-connectionline-stroke: var(--accent);
  --xy-connectionline-stroke-width: 1.5;
  --xy-selection-background-color: color-mix(in srgb, var(--accent) 6%, transparent);
  --xy-selection-border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  --xy-minimap-background-color: var(--surface);
  --xy-minimap-mask-background-color: color-mix(in srgb, var(--canvas) 70%, transparent);
  --xy-minimap-mask-stroke-color: var(--line-strong);
  --xy-minimap-mask-stroke-width: 1;
  --xy-controls-button-background-color: var(--surface);
  --xy-controls-button-background-color-hover: var(--sunken);
  --xy-controls-button-color: var(--ink);
  --xy-controls-button-color-hover: var(--ink);
  --xy-controls-button-border-color: var(--line);
  --xy-controls-box-shadow: var(--shadow);
  --xy-attribution-background-color: transparent;
  --xy-resize-background-color: var(--accent);
}
.lab-canvas .react-flow__attribution a { color: var(--muted); }
.lab-canvas .react-flow__controls {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
}
.lab-canvas .react-flow__controls-button:last-child { border-bottom: none; }
.lab-canvas .react-flow__controls-button svg { fill: currentColor; }
.lab-canvas .react-flow__minimap {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
}
.lab-canvas .react-flow__node:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.lab-canvas .lab-edge.selected .react-flow__edge-path { stroke-width: 2; }
.lab-canvas .lab-handle {
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--accent);
  border-radius: 9999px;
  background: var(--surface);
  opacity: 0;
  transition: opacity 120ms;
}
.lab-canvas .react-flow__node:hover .lab-handle,
.lab-canvas .react-flow__node.selected .lab-handle,
.lab-canvas .react-flow.connecting .lab-handle { opacity: 1; }
`;
