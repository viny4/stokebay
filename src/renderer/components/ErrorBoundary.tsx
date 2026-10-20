import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Shows a recovery screen instead of a blank window, and sends the error to the main log. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    window.api.reportError({
      message: error.message,
      stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`,
      source: 'react',
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="font-medium text-sm text-status-paused">Something broke on this screen.</p>
        <p className="text-sm text-muted">Your data is safe. Reload to continue.</p>
        <button
          type="button"
          className="rounded-md border border-line px-3 py-1.5 text-sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
