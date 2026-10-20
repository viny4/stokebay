// Hologram-blue overrides for React Flow's stock look. Scoped to .lab-canvas and injected by
// the Lab, so the app's global stylesheet stays free of canvas details.
export const LAB_CSS = `
.lab-canvas .react-flow {
  --xy-background-color: transparent;
  --xy-edge-stroke: rgb(56 214 255 / 0.55);
  --xy-edge-stroke-width: 1.5;
  --xy-edge-stroke-selected: #7fe8ff;
  --xy-connectionline-stroke: #38d6ff;
  --xy-connectionline-stroke-width: 1.5;
  --xy-selection-background-color: rgb(56 214 255 / 0.08);
  --xy-selection-border: 1px dashed rgb(56 214 255 / 0.7);
  --xy-minimap-background-color: rgb(6 22 42 / 0.92);
  --xy-minimap-mask-background-color: rgb(2 10 23 / 0.7);
  --xy-minimap-mask-stroke-color: rgb(56 214 255 / 0.6);
  --xy-controls-button-background-color: rgb(8 28 54 / 0.96);
  --xy-controls-button-background-color-hover: rgb(20 52 88 / 0.96);
  --xy-controls-button-color: #38d6ff;
  --xy-controls-button-color-hover: #e0f2fe;
  --xy-controls-button-border-color: rgb(56 189 248 / 0.26);
  --xy-controls-box-shadow: 0 0 14px -4px rgb(56 214 255 / 0.5);
  --xy-attribution-background-color: transparent;
  --xy-resize-background-color: #38d6ff;
}
.lab-canvas .react-flow__attribution a { color: rgb(132 169 204 / 0.5); }
.lab-canvas .react-flow__controls { border: 1px solid rgb(56 189 248 / 0.3); }
.lab-canvas .react-flow__controls-button svg { fill: currentColor; }
.lab-canvas .react-flow__minimap {
  border: 1px solid rgb(56 189 248 / 0.3);
  box-shadow: 0 0 18px -6px rgb(56 214 255 / 0.5);
}
.lab-canvas .react-flow__node:focus-visible { outline: 2px solid #38d6ff; outline-offset: 3px; }
.lab-canvas .lab-edge .react-flow__edge-path { filter: drop-shadow(0 0 3px rgb(56 214 255 / 0.6)); }
.lab-canvas .lab-edge.selected .react-flow__edge-path { stroke-width: 2.5; }
.lab-canvas .lab-handle {
  width: 9px;
  height: 9px;
  border: 1px solid #020a17;
  border-radius: 0;
  background: #38d6ff;
  box-shadow: 0 0 6px #38d6ff;
  opacity: 0;
  transition: opacity 120ms;
}
.lab-canvas .react-flow__node:hover .lab-handle,
.lab-canvas .react-flow__node.selected .lab-handle,
.lab-canvas .react-flow.connecting .lab-handle { opacity: 1; }
`;
