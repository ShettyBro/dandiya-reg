import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// After a fresh deploy, a browser holding a stale cached index.html can try to dynamically
// import a JS chunk whose hashed filename no longer exists (the old build was replaced) — this
// throws a module-load error that would otherwise show the generic "Something went wrong" screen
// even though a plain reload (which re-fetches the current index.html) fixes it instantly. Detect
// that specific failure and reload automatically, once, instead of showing an error at all.
const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;
const RELOAD_GUARD_KEY = "dandiya-chunk-reload-attempted";

function isChunkLoadError(error: Error): boolean {
  return CHUNK_LOAD_ERROR_PATTERN.test(error.message);
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error.message, info.componentStack);

    if (isChunkLoadError(error)) {
      let alreadyAttempted = false;
      try {
        alreadyAttempted = sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
        if (!alreadyAttempted) {
          sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
        }
      } catch {
        // sessionStorage unavailable — fall through to the visible error screen instead of
        // risking a reload loop we can't guard against.
        alreadyAttempted = true;
      }
      if (!alreadyAttempted) {
        window.location.reload();
      }
    }
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
