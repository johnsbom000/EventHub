import React, { Component, ReactNode, ErrorInfo } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "stream-chat-react/dist/css/v2/index.css";
import { LocationProvider } from "./context/LocationContext";
import { Auth0Context, Auth0Provider, initialContext, type Auth0ContextInterface } from "@auth0/auth0-react";
import { useAuth0 } from "@auth0/auth0-react";
import { setTokenGetter } from "@/lib/authToken";
import { installRuntimeFetchBaseUrl } from "@/lib/runtimeUrls";

if (typeof window !== "undefined") {
  installRuntimeFetchBaseUrl();
  document.documentElement.style.colorScheme = "light";
}

const INSECURE_PREVIEW_AUTH_MESSAGE =
  "Sign in is unavailable on non-secure preview URLs. Use localhost on your Mac or an HTTPS preview URL.";

function isAuth0SecureOrigin(): boolean {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const host = window.location.hostname.trim().toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

const AUTH0_SECURE_ORIGIN_ENABLED = isAuth0SecureOrigin();
const AUTH0_DOMAIN = String(import.meta.env.VITE_AUTH0_DOMAIN || "").trim();
const AUTH0_CLIENT_ID = String(import.meta.env.VITE_AUTH0_CLIENT_ID || "").trim();
const AUTH0_CONFIGURED = AUTH0_DOMAIN.length > 0 && AUTH0_CLIENT_ID.length > 0;
const AUTH0_MISSING_CONFIG_MESSAGE =
  "Sign in is unavailable because Auth0 env is missing. Set VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID, then restart the client.";
const AUTH0_DISABLED_MESSAGE = AUTH0_SECURE_ORIGIN_ENABLED
  ? AUTH0_MISSING_CONFIG_MESSAGE
  : INSECURE_PREVIEW_AUTH_MESSAGE;

if (typeof window !== "undefined" && AUTH0_SECURE_ORIGIN_ENABLED && !AUTH0_CONFIGURED) {
  console.error("[auth0] Missing VITE_AUTH0_DOMAIN or VITE_AUTH0_CLIENT_ID. Auth is disabled until these are set.");
}

const insecurePreviewAuth0ContextValue: Auth0ContextInterface = {
  ...initialContext,
  isAuthenticated: false,
  isLoading: false,
  error: undefined,
  user: undefined,
  getAccessTokenSilently: (async () => "") as any,
  getAccessTokenWithPopup: (async () => undefined) as any,
  getIdTokenClaims: (async () => undefined) as any,
  loginWithRedirect: (async () => {
    throw new Error(AUTH0_DISABLED_MESSAGE);
  }) as any,
  loginWithPopup: (async () => {
    throw new Error(AUTH0_DISABLED_MESSAGE);
  }) as any,
  connectAccountWithRedirect: (async () => {
    throw new Error(AUTH0_DISABLED_MESSAGE);
  }) as any,
  logout: (async () => undefined) as any,
};

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
          <h1>We hit a temporary issue</h1>
          <p>Please refresh the page and try again.</p>
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

const appContent = (
  <>
    <AuthTokenBridge />
    <LocationProvider>
      <App />
    </LocationProvider>
  </>
);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      {AUTH0_SECURE_ORIGIN_ENABLED && AUTH0_CONFIGURED ? (
        <Auth0Provider
          domain={AUTH0_DOMAIN}
          clientId={AUTH0_CLIENT_ID}
          cacheLocation="localstorage"
          useRefreshTokens={true}
          authorizationParams={{
            redirect_uri: window.location.origin,
            audience: "https://eventhub-api",
            scope: "openid profile email",
          }}
          onRedirectCallback={(appState) => {
            const target = appState?.returnTo || "/";
            window.history.replaceState({}, document.title, target);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          {appContent}
        </Auth0Provider>
      ) : (
        <Auth0Context.Provider value={insecurePreviewAuth0ContextValue}>
          {appContent}
        </Auth0Context.Provider>
      )}
    </ErrorBoundary>
  </React.StrictMode>
);
