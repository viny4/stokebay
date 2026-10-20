import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Forward renderer crashes to the main process log so they're visible in the terminal.
window.addEventListener('error', (event) => {
  window.api.reportError({
    message: event.message,
    stack: event.error instanceof Error ? event.error.stack : undefined,
    source: 'error',
  });
});
window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason;
  window.api.reportError({
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    source: 'unhandledrejection',
  });
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
