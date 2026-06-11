import { Switch, Route, useLocation } from "wouter";
import React, { useEffect, useRef, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "./lib/queryClient";
import { useAuth0 } from "@auth0/auth0-react";

import { Toaster } from "@/components/ui/toaster";
import { ScrollToTop } from "@/components/ScrollToTop";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTrackPageView } from "@/hooks/useTrackPageView";
import EmailVerificationGate from "@/components/EmailVerificationGate";

import Home from "@/pages/Home";
import TemporaryLanding from "@/pages/TemporaryLanding";
import BrowseVendors from "@/pages/BrowseVendors";
import CustomerDashboard from "@/pages/CustomerDashboard";

import VendorDashboard from "@/pages/VendorDashboard";
import VendorLogin from "@/pages/VendorLogin";
import VendorOnboarding from "@/pages/VendorOnboarding";
import VendorBookings from "@/pages/VendorBookings";
import VendorListings from "@/pages/VendorListings";
import VendorCreateListing from "@/pages/VendorCreateListing";
import VendorListingEdit from "@/pages/VendorListingEdit";
import VendorMessages from "@/pages/VendorMessages";
import VendorPayments from "@/pages/VendorPayments";
import VendorDiscounts from "@/pages/VendorDiscounts";
import VendorReviews from "@/pages/VendorReviews";
import VendorNotifications from "@/pages/VendorNotifications";
import VendorConnectRefresh from "@/pages/VendorConnectRefresh";
import VendorConnectReturn from "@/pages/VendorConnectReturn";
import MyHub from "@/pages/myhub";
import VendorHub from "@/pages/vendorhub";
import VendorDisputes from "@/pages/VendorDisputes";

import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/not-found";
import ListingDetail from "@/pages/ListingDetail";
import CustomerBookingDetail from "@/pages/customer/CustomerBookingDetail";
import Checkout from "@/pages/Checkout";
import Terms from "@/pages/Terms";
import { deriveVendorDetection, type VendorMeState } from "@/lib/vendorState";
import { useIsVendorOnly } from "@/hooks/useIsVendorOnly";
import { useToast } from "@/hooks/use-toast";
import Privacy from "@/pages/Privacy";
import MarqueeVendorProgram from "@/pages/MarqueeVendorProgram";
import FoundingVendorProgram from "@/pages/FoundingVendorProgram";
import VendorProvision from "@/pages/VendorProvision";

type CustomerMeIntent = {
  vendorIntentPending?: boolean;
};

// Clears the one-shot vendor-intent flag (server + cache) at the moment a
// redirect to /vendor/provision fires, so the redirect can never fire twice —
// even if the user leaves without submitting a business name.
function consumeVendorIntentFlag() {
  queryClient.setQueryData<CustomerMeIntent | null>(["/api/customer/me"], (old) =>
    old ? { ...old, vendorIntentPending: false } : old
  );
  apiRequest("POST", "/api/me/consume-vendor-intent").catch(() => {});
}

// Sends flagged customers (vendorIntentPending) to the business-name page on
// sign-ins that don't pass through /post-login (e.g. signing in from a listing
// page). Inert for everyone else: the flag defaults to false and is only set
// manually for specific re-engagement targets.
function VendorIntentRedirect() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();
  const { data: customerMe } = useQuery<CustomerMeIntent | null>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !customerMe?.vendorIntentPending) return;
    const pathname = location.split("?")[0] || "/";
    // /post-login owns its own redirect decision; never hijack vendor pages.
    if (pathname === "/post-login" || pathname.startsWith("/vendor")) return;
    consumeVendorIntentFlag();
    setLocation("/vendor/provision");
  }, [isAuthLoading, isAuthenticated, customerMe, location, setLocation]);

  return null;
}

// Handles the post-sign-in redirect for normal logins (not "Become a Vendor").
// AuthModal routes here via appState.returnTo so this mounts fresh after
// onRedirectCallback fires — avoiding the useState timing race in RootEntry.
function PostLogin() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();
  const hasRedirectedRef = useRef(false);

  // Provision the DB user row immediately on first login, in parallel with the
  // vendor check. Without this, users who bounce before Navigation renders never
  // get a row — they exist in Auth0 but not in our database.
  const { data: customerMe, isLoading: isCustomerMeLoading } = useQuery<CustomerMeIntent | null>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    staleTime: Infinity,
  });

  const {
    data: vendorAccount,
    isLoading: isVendorLoading,
    isFetching: isVendorFetching,
    error: vendorError,
  } = useQuery<VendorMeState>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated && !isAuthLoading,
    retry: false,
    staleTime: 0,
  });

  const vendorDetection = deriveVendorDetection({
    data: vendorAccount,
    isLoading: isVendorLoading,
    isFetching: isVendorFetching,
    error: vendorError,
  });

  useEffect(() => {
    if (isAuthLoading) return;
    if (!isAuthenticated) { setLocation("/"); return; }
    if (vendorDetection.status === "loading") return;
    // Wait for the intent flag before routing a non-vendor, so a flagged
    // customer can't land on /dashboard first.
    if (vendorDetection.status === "non_vendor" && isCustomerMeLoading) return;
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;

    if (vendorDetection.status === "vendor") {
      setLocation("/vendor/my-hub");
    } else if (vendorDetection.status === "non_vendor") {
      if (customerMe?.vendorIntentPending) {
        consumeVendorIntentFlag();
        setLocation("/vendor/provision");
      } else {
        setLocation("/dashboard");
      }
    } else {
      const lastKnownVendorAccount =
        typeof window !== "undefined" &&
        window.localStorage.getItem("eventhub:last-known-vendor-account") === "1";
      setLocation(lastKnownVendorAccount ? "/vendor/my-hub" : "/dashboard");
    }
  }, [isAuthLoading, isAuthenticated, vendorDetection, customerMe, isCustomerMeLoading, setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading your account...</p>
    </div>
  );
}

function RootEntry() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();
  const { toast } = useToast();
  const hasShownToastRef = useRef(false);
  const { isVendorOnly, isLoading: isVendorOnlyLoading } = useIsVendorOnly();

  // "Become a Vendor" flow — check vendor status and redirect to dashboard/onboarding.
  const [vendorIntent] = useState(() => {
    if (typeof window === "undefined") return false;
    const urlIntent = new URLSearchParams(window.location.search).get("intent");
    const ssIntent = sessionStorage.getItem("eh:after-auth-intent");
    if (ssIntent === "vendor") sessionStorage.removeItem("eh:after-auth-intent");
    return urlIntent === "vendor" || ssIntent === "vendor";
  });

  const {
    data: vendorAccount,
    isLoading: isVendorLoading,
    isFetching: isVendorFetching,
    error: vendorError,
  } = useQuery<VendorMeState>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated && vendorIntent,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const vendorDetection = deriveVendorDetection({
    data: vendorAccount,
    isLoading: isVendorLoading,
    isFetching: isVendorFetching,
    error: vendorError,
  });

  useEffect(() => {
    if (!vendorIntent || isAuthLoading || !isAuthenticated || vendorDetection.status === "loading") return;

    let nextPath: string;
    if (vendorDetection.status === "vendor") {
      nextPath = "/vendor/dashboard";
      if (!hasShownToastRef.current) {
        toast({ title: "Welcome back", description: "It looks like you already have a vendor account!" });
        hasShownToastRef.current = true;
      }
    } else if (vendorDetection.status === "non_vendor") {
      nextPath = "/vendor/provision";
    } else {
      const lastKnownVendorAccount =
        typeof window !== "undefined" &&
        window.localStorage.getItem("eventhub:last-known-vendor-account") === "1";
      nextPath = lastKnownVendorAccount ? "/vendor/dashboard" : "/vendor/provision";
    }

    const pathname = location.split("?")[0] || "/";
    if (pathname !== nextPath) setLocation(nextPath);
  }, [vendorIntent, isAuthLoading, isAuthenticated, location, setLocation, vendorDetection, toast]);

  // [vendor-only restrictions] remove this entire effect
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || vendorIntent || isVendorOnlyLoading || !isVendorOnly) return;
    setLocation("/vendor/dashboard");
  }, [isAuthLoading, isAuthenticated, vendorIntent, isVendorOnlyLoading, isVendorOnly, setLocation]);

  // MARKETPLACE_HIDDEN: remove this effect and restore `return <Home />;` at the bottom when going live
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || vendorIntent || isVendorOnlyLoading || isVendorOnly) return;
    setLocation("/dashboard");
  }, [isAuthLoading, isAuthenticated, vendorIntent, isVendorOnlyLoading, isVendorOnly, setLocation]);

  // MARKETPLACE_HIDDEN: restore `return <Home />;` when going live
  if (isAuthLoading) return <TemporaryLanding />;
  if (!isAuthenticated) return <TemporaryLanding />;
  if (vendorIntent && vendorDetection.status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your account...</p>
      </div>
    );
  }
  if (isAuthenticated && (isVendorOnly || isVendorOnlyLoading)) return <TemporaryLanding />; // [vendor-only restrictions] remove this line

  // MARKETPLACE_HIDDEN: restore `return <Home />;` when going live
  return <TemporaryLanding />;
}

// [vendor-only restrictions] remove this entire VendorOnlyGuard component
function VendorOnlyGuard({ children }: { children: React.ReactNode }) {
  const { isVendorOnly, isLoading } = useIsVendorOnly();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isVendorOnly) setLocation("/vendor/dashboard");
  }, [isVendorOnly, isLoading, setLocation]);

  if (isLoading || isVendorOnly) return null;
  return <>{children}</>;
}

// MARKETPLACE_HIDDEN: remove this component when going live
function MarketplaceRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/"); }, [setLocation]);
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <VendorIntentRedirect />
      <Switch>
        <Route path="/" component={RootEntry} />
        <Route path="/post-login" component={PostLogin} />
        {/* [vendor-only restrictions] unwrap VendorOnlyGuard from all routes below that have it */}
        {/* MARKETPLACE_HIDDEN: restore <VendorOnlyGuard><Home /></VendorOnlyGuard> when going live */}
        <Route path="/marketplace" component={MarketplaceRedirect} />

        {/* Customer */}
        <Route path="/dashboard" component={() => <VendorOnlyGuard><CustomerDashboard /></VendorOnlyGuard>} />
        <Route path="/dashboard/:section" component={() => <VendorOnlyGuard><CustomerDashboard /></VendorOnlyGuard>} />
        {/* MARKETPLACE_HIDDEN: restore <VendorOnlyGuard><BrowseVendors /></VendorOnlyGuard> when going live */}
        <Route path="/browse" component={MarketplaceRedirect} />
        <Route path="/listing/:id" component={ListingDetail} />
        <Route path="/booking/:bookingId" component={() => <VendorOnlyGuard><CustomerBookingDetail /></VendorOnlyGuard>} />
        <Route path="/checkout/:listingId" component={() => <VendorOnlyGuard><Checkout /></VendorOnlyGuard>} />
        <Route path="/shop/:vendorId" component={VendorHub} />
        <Route path="/vendor/hub/:vendorId" component={VendorHub} />
        {/* Vendor */}
        <Route path="/vendor/login" component={VendorLogin} />
        <Route path="/vendor/provision" component={VendorProvision} />
        <Route path="/vendor/onboarding" component={VendorOnboarding} />
        <Route path="/vendor/dashboard" component={VendorDashboard} />
        <Route path="/vendor/bookings" component={VendorBookings} />
        <Route path="/vendor/listings" component={VendorListings} />
        <Route path="/vendor/listings/new" component={VendorCreateListing} />
        <Route path="/vendor/listings/:id" component={VendorListingEdit} />
        <Route path="/vendor/messages" component={VendorMessages} />
        <Route path="/vendor/payments" component={VendorPayments} />
        <Route path="/vendor/discounts" component={VendorDiscounts} />
        <Route path="/vendor/reviews" component={VendorReviews} />
        <Route path="/vendor/notifications" component={VendorNotifications} />
        <Route path="/vendor/connect/refresh" component={VendorConnectRefresh} />
        <Route path="/vendor/connect/return" component={VendorConnectReturn} />
        <Route path="/vendor/disputes" component={VendorDisputes} />
        <Route path="/vendor/shop" component={MyHub} />
        <Route path="/vendor/my-hub" component={MyHub} />
        <Route path="/my-hub" component={MyHub} />

        {/* Program pages */}
        <Route path="/vendor/marquee" component={MarqueeVendorProgram} />
        <Route path="/vendor/founding" component={FoundingVendorProgram} />

        {/* Legal */}
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />

        {/* Admin */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/:section" component={AdminDashboard} />

        <Route component={NotFound} />
      </Switch>
    </>
  );
}

// Checks once per browser session whether the authenticated user is an admin.
// If so, redirects them to /admin. Works for both full OAuth redirects and
// silent token restores from localStorage (which don't fire onRedirectCallback).
function AdminAutoRedirect() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth0();

  // One check per browser session — cleared when tab/window closes.
  const [shouldCheck, setShouldCheck] = useState(
    () => sessionStorage.getItem("eh_admin_checked") !== "1"
  );

  const { data, isError } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/me"],
    enabled: isAuthenticated && !isLoading && shouldCheck,
    retry: false,
  });

  useEffect(() => {
    if (!shouldCheck) return;
    if (!data && !isError) return; // still in flight
    setShouldCheck(false);
    sessionStorage.setItem("eh_admin_checked", "1");
    // Don't redirect away from invite-link flows (?fv= or ?ref=).
    const params = new URLSearchParams(window.location.search);
    if (data?.isAdmin && !params.has("fv") && !params.has("ref") && !params.has("mv")) setLocation("/admin");
  }, [data, isError, shouldCheck, setLocation]);

  return null;
}

function AppContent() {
  const [location] = useLocation();
  useTrackPageView();

  // One-time eviction of stale onboarding drafts that may contain PII (business
  // address, phone, email). The draft key was removed in favour of stateless
  // sessions; this clears any data already stored in existing browsers.
  useEffect(() => {
    localStorage.removeItem("vendorOnboarding:v1");
  }, []);

  useEffect(() => {
    const pathname = location.split("?")[0] || "/";
    const isExcludedRoute =
      pathname === "/" ||
      pathname.startsWith("/browse") ||
      pathname === "/dashboard" ||
      pathname.startsWith("/dashboard/") ||
      pathname.startsWith("/booking/");

    document.documentElement.classList.toggle("vendor-dashboard-parity", !isExcludedRoute);
  }, [location]);

  return (
    <>
      <AdminAutoRedirect />
      <Router />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <EmailVerificationGate>
          <AppContent />
        </EmailVerificationGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
