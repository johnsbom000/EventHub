import { useAuth0 } from "@auth0/auth0-react";
import { Button } from "@/components/ui/button";

export default function AuthTest() {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout } =
    useAuth0();

  if (isLoading) return <div className="p-6">Loading auth…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Auth0 Test</h1>

      {error && (
        <div className="rounded border p-3 text-sm">
          Error: {error.message}
        </div>
      )}

      {isAuthenticated ? (
        <div className="space-y-3">
          <div className="text-sm">
            Logged in as <span className="font-medium">{user?.email || user?.name}</span>
          </div>

          <Button
            onClick={() =>
              logout({ logoutParams: { returnTo: window.location.origin } })
            }
          >
            Logout
          </Button>

          <pre className="text-xs whitespace-pre-wrap rounded border p-3">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="space-x-2">
        <Button
            onClick={() =>
                loginWithRedirect({
                appState: { returnTo: "/auth-test" },
                })
            }
        >
            Login
        </Button>

        <Button
            variant="outline"
            onClick={() =>
                loginWithRedirect({
                authorizationParams: { screen_hint: "signup" },
                appState: { returnTo: "/auth-test" },
                })
            }
        >
            Signup
        </Button>

        </div>
      )}
    </div>
  );
}
