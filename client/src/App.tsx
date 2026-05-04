import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { useAuth0 } from "@auth0/auth0-react";

import { Toaster } from "@/components/ui/toaster";
import { ScrollToTop } from "@/components/ScrollToTop";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTrackPageView } from "@/hooks/useTrackPageView";

import Home from "@/pages/Home";
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
import VendorReviews from "@/pages/VendorReviews";
import VendorNotifications from "@/pages/VendorNotifications";
import MyHub from "@/pages/myhub";
import VendorHub from "@/pages/vendorhub";

import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/not-found";
import ListingDetail from "@/pages/ListingDetail";
import Checkout from "@/pages/Checkout";
import Terms from "@/pages/Terms";

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Home} />

        {/* Customer */}
        <Route path="/dashboard" component={CustomerDashboard} />
        <Route path="/dashboard/:section" component={CustomerDashboard} />
        <Route path="/browse" component={BrowseVendors} />
        <Route path="/listing/:id" component={ListingDetail} />
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
        <Route path="/vendor/reviews" component={VendorReviews} />
        <Route path="/vendor/notifications" component={VendorNotifications} />
        <Route path="/vendor/shop" component={MyHub} />
        <Route path="/vendor/my-hub" component={MyHub} />
        <Route path="/my-hub" component={MyHub} />

        {/* Legal */}
        <Route path="/terms" component={Terms} />

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
      pathname.startsWith("/dashboard/");

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
