import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Add error boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by error boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h1>Something went wrong</h1>
        <p>Please check the console for more details.</p>
      </div>;
    }

    return this.props.children;
  }
}

// Create root and render
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

try {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  console.error("Failed to render app:", error);
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; font-family: sans-serif; color: red;">
        <h1>Failed to load the application</h1>
        <p>${error instanceof Error ? error.message : String(error)}</p>
        <p>Check the browser console for more details.</p>
      </div>
    `;
  }
}