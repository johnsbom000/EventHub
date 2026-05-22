import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useAuth0 } from "@auth0/auth0-react";

import { Toaster } from "@/components/ui/toaster";
import { ScrollToTop } from "@/components/ScrollToTop";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTrackPageView } from "@/hooks/useTrackPageView";

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
import { useToast } from "@/hooks/use-toast";
import Privacy from "@/pages/Privacy";

function RootEntry() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();
  const { toast } = useToast();
  const hasShownExistingVendorToastRef = useRef(false);

  // Read vendor intent once on mount — check both the URL param and sessionStorage
  // (sessionStorage is the fallback if Auth0's redirect drops the ?intent=vendor param).
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
    queryKey: ["/api/vendor/me", "root-entry"],
    enabled: isAuthenticated,
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
    if (isAuthLoading || !isAuthenticated || vendorDetection.status === "loading") {
      return;
    }

    let nextPath: string;

    if (vendorDetection.status === "vendor") {
      const needsOnboarding =
        vendorDetection.needsNewVendorProfileOnboarding ||
        !vendorDetection.hasAnyVendorProfiles ||
        !vendorDetection.hasActiveVendorProfile;
      nextPath = vendorIntent ? "/vendor/dashboard" : needsOnboarding ? "/vendor/onboarding" : "/vendor/dashboard";
    } else if (vendorDetection.status === "non_vendor") {
      nextPath = vendorIntent ? "/vendor/onboarding" : "/dashboard";
    } else {
      const lastKnownVendorAccount =
        typeof window !== "undefined" &&
        window.localStorage.getItem("eventhub:last-known-vendor-account") === "1";
      if (vendorIntent) {
        nextPath = lastKnownVendorAccount ? "/vendor/dashboard" : "/vendor/onboarding";
      } else {
        nextPath = lastKnownVendorAccount ? "/vendor/dashboard" : "/dashboard";
      }
    }

    const pathname = location.split("?")[0] || "/";
    if (pathname === "/" && vendorIntent && vendorDetection.status === "vendor" && !hasShownExistingVendorToastRef.current) {
      toast({
        title: "Welcome back",
        description: "It looks like you already have an account with us!",
      });
      hasShownExistingVendorToastRef.current = true;
    }

    if (pathname !== nextPath) {
      setLocation(nextPath);
    }
  }, [isAuthLoading, isAuthenticated, location, setLocation, vendorDetection, vendorIntent, toast]);

  if (!isAuthenticated && !isAuthLoading) {
    return <TemporaryLanding />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading your account...</p>
    </div>
  );
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={RootEntry} />
        <Route path="/marketplace" component={Home} />

        {/* Customer */}
        <Route path="/dashboard" component={CustomerDashboard} />
        <Route path="/dashboard/:section" component={CustomerDashboard} />
        <Route path="/browse" component={BrowseVendors} />
        <Route path="/listing/:id" component={ListingDetail} />
        <Route path="/booking/:bookingId" component={CustomerBookingDetail} />
        <Route path="/checkout/:listingId" component={Checkout} />
        <Route path="/shop/:vendorId" component={VendorHub} />
        <Route path="/vendor/hub/:vendorId" component={VendorHub} />
        {/* Vendor */}
        <Route path="/vendor/login" component={VendorLogin} />
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
    // Mark as checked so navigation within the session doesn't re-trigger.
    setShouldCheck(false);
    sessionStorage.setItem("eh_admin_checked", "1");
    if (data?.isAdmin) setLocation("/admin");
  }, [data, isError, shouldCheck, setLocation]);

  return null;
}

function AppContent() {
  const [location] = useLocation();
  useTrackPageView();

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
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
