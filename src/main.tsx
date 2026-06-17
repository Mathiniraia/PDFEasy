import { Component, StrictMode } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("GA4 Stream 15068874272 safely anchored onto layout DOM.");

// ── Global Error Boundary ──────────────────────────────────────────────────
// Custom React error boundary component.
// Catches any runtime crash and shows a readable fallback instead of
// a blank white page.
function ErrorFallback({ message }: { message: string }): ReactNode {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", fontFamily: "sans-serif",
      background: "#f9f9f9", color: "#333", padding: "2rem", textAlign: "center"
    }}>
      <h2 style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>
        ⚠️ Something went wrong
      </h2>
      <p style={{ fontSize: "0.85rem", color: "#888", maxWidth: 480 }}>
        {message}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: "1.5rem", padding: "0.6rem 1.4rem",
          background: "#111", color: "#fff", border: "none",
          borderRadius: "8px", cursor: "pointer", fontSize: "0.85rem"
        }}
      >
        Reload Page
      </button>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || String(error) };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PDF Easy] App crashed:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return <ErrorFallback message={this.state.message} />;
    }
    return this.props.children;
  }
}
// ──────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
