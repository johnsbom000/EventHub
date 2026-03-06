import React, { Component, ReactNode, ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "stream-chat-react/dist/css/v2/index.css";
import { LocationProvider } from "./context/LocationContext";
import { Auth0Provider } from "@auth0/auth0-react";
import { useAuth0 } from "@auth0/auth0-react";
import { setTokenGetter } from "@/lib/authToken";

const THEME_STORAGE_KEY = "eventhub-theme";
if (typeof window !== "undefined") {
  const persistedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  const initialTheme = persistedTheme === "dark" ? "dark" : "light";
  document.documentElement.classList.toggle("dark", initialTheme === "dark");
}

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
        <div style={{ padding: "20px", fontFamily: "\"DM Sans\", \"Segoe UI\", sans-serif" }}>
          <h1>Something went wrong</h1>
          <p>Please check the console for more details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
function AuthTokenBridge() {
  const { getAccessTokenSilently } = useAuth0();

  const tokenGetter = React.useCallback(async () => {
    try {
      // Always attempt; Auth0 handles cached token reads/refresh internally.
      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      return token || null;
    } catch {
      // Not logged in yet or transient Auth0 failure.
      return null;
    }
  }, [getAccessTokenSilently]);

  // Register during render so first protected queries don't race a post-render effect.
  setTokenGetter(tokenGetter);

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
