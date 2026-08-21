import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Last-resort crash screen for the whole app. Deliberately outside
 * ThemeProvider/FluentProvider (see main.tsx) and built from plain HTML —
 * if whatever crashed is Fluent- or theme-related, this still has to
 * render — using only the CSS custom properties from index.css, which are
 * plain global variables with no JS dependency. React error boundaries
 * only catch render/lifecycle errors, not ones inside event handlers or
 * async callbacks — those already go through the app's own toast() calls
 * (see useAppActions.ts's try/catch blocks). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          background: "var(--background, #17161c)",
          color: "var(--foreground, #eee)",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div style={{ fontSize: 40 }}>⚠️</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: 420, fontSize: 13, opacity: 0.75, margin: 0, lineHeight: 1.5 }}>
          LibRE FTA hit an unexpected error and can't continue. Your work is autosaved
          periodically, so reloading should recover most of it — you'll be prompted to restore it
          on the next screen.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: "8px 20px",
            borderRadius: 6,
            border: "1px solid var(--border, #444)",
            background: "var(--primary, #3b82f6)",
            color: "var(--primary-foreground, #fff)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        <details style={{ marginTop: 16, maxWidth: 520, fontSize: 11, opacity: 0.55, textAlign: "left" }}>
          <summary style={{ cursor: "pointer" }}>Error details</summary>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
          </pre>
        </details>
      </div>
    );
  }
}
