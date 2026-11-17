import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Prevents an unexpected render/lifecycle error from blanking the entire workspace.
 * Event-handler and asynchronous errors still require handling at their call sites.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally avoid sending error details to an unconfigured telemetry provider.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-fallback" role="alert" aria-labelledby="error-title">
          <div className="error-fallback-panel">
            <p className="error-fallback-eyebrow">WORKSPACE RECOVERY</p>
            <h1 id="error-title">InfiniteX could not render this view</h1>
            <p>
              An unexpected interface error interrupted this session. Reload the workspace
              to start a fresh page session. Unsaved local changes may be lost.
            </p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload workspace
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
