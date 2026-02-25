import React, { Component, ReactNode, ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "stream-chat-react/dist/css/v2/index.css";
import { LocationProvider } from "./context/LocationContext";
import { Auth0Provider } from "@auth0/auth0-react";
import { useAuth0 } from "@auth0/auth0-react";
import { setTokenGetter } from "@/lib/authToken";

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
        <div style={{ padding: "20px", fontFamily: "\"Tienne\", Georgia, serif" }}>
          <h1>Something went wrong</h1>
          <p>Please check the console for more details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
function AuthTokenBridge() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  React.useEffect(() => {
    setTokenGetter(async () => {
      try {
        // Always attempt; Auth0 will handle refresh if needed.
        // Include audience/scope to ensure we get the API access token.
        const token = await Promise.race([
          getAccessTokenSilently({
            authorizationParams: {
              audience: "https://eventhub-api",
              scope: "openid profile email",
            },
          }),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("getAccessTokenSilently timeout")), 2000)
          ),
        ]);

        return token || null;
      } catch (e) {
        // If not logged in yet (or any transient Auth0 issue), return null
        return null;
      }
    });
  }, [getAccessTokenSilently, isAuthenticated]);

  return null;
}


const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Auth0Provider
        domain="dev-u831fugzvigrqe8g.us.auth0.com"
        clientId="gris26WuQ5P9me2vXPJBSuzKNpJrR5nW"
        cacheLocation="localstorage"
        useRefreshTokens={false}
        authorizationParams={{
          redirect_uri: window.location.origin,
          audience: "https://eventhub-api",
          scope: "openid profile email",
        }}


        onRedirectCallback={(appState) => {
          const target = appState?.returnTo || window.location.pathname;
          window.location.assign(target);
        }}
      >
        <AuthTokenBridge />
        <LocationProvider>
          <App />
        </LocationProvider>
      </Auth0Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
