import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-midnight-950 px-6 text-center text-white">
          <p className="font-display text-xl font-semibold">Something went wrong.</p>
          <p className="text-sm text-white/60">Please reload the page and try again.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-pill bg-festival-gold px-6 py-2 text-sm font-semibold text-midnight-950"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
