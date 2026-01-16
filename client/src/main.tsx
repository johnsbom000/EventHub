import React, { Component, ReactNode, ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { LocationProvider } from "./context/LocationContext";
import { Auth0Provider } from "@auth0/auth0-react";

// Simple error boundary to catch runtime errors
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by error boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
          <h1>Something went wrong</h1>
          <p>Please check the console for more details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
      <Auth0Provider
        domain="dev-u831fugzvigrqe8g.us.auth0.com"
        clientId="gris26WuQ5P9me2vXPJBSuzKNpJrR5nW"
        cacheLocation="localstorage"
        useRefreshTokens={true}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: "https://eventhub-api",
          scope: "openid profile email offline_access",
        }}


        onRedirectCallback={(appState) => {
          const target = appState?.returnTo || window.location.pathname;
          window.location.assign(target);
        }}
      >
        <LocationProvider>
          <App />
        </LocationProvider>
      </Auth0Provider>
  </React.StrictMode>
);

