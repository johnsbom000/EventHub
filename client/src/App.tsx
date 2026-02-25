import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";

import { Toaster } from "@/components/ui/toaster";
import { ScrollToTop } from "@/components/ScrollToTop";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTrackPageView } from "@/hooks/useTrackPageView";

import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import BrowseVendors from "@/pages/BrowseVendors";
import VendorProfile from "@/pages/VendorProfile";
import EventPlanner from "@/pages/EventPlanner";
import CuratedRecommendations from "@/pages/CuratedRecommendations";
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
import VendorAccount from "@/pages/VendorAccount";

import AdminDashboard from "@/pages/AdminDashboard";
import UIDemo from "@/pages/UIDemo";
import NotFound from "@/pages/not-found";
import AuthTest from "@/pages/AuthTest";
import ListingDetail from "@/pages/ListingDetail";
import Checkout from "@/pages/Checkout";

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />

        {/* Customer */}
        <Route path="/dashboard" component={CustomerDashboard} />
        <Route path="/dashboard/:section" component={CustomerDashboard} />
        <Route path="/browse" component={BrowseVendors} />
        <Route path="/listing/:id" component={ListingDetail} />
        <Route path="/checkout/:listingId" component={Checkout} />
        <Route path="/planner" component={EventPlanner} />
        <Route path="/recommendations/:eventId" component={CuratedRecommendations} />

        {/* Vendor */}
        <Route path="/vendor/login" component={VendorLogin} />
        <Route path="/vendor/signup" component={Signup} />
        <Route path="/vendor/onboarding" component={VendorOnboarding} />
        <Route path="/vendor/dashboard" component={VendorDashboard} />
        <Route path="/vendor/account" component={VendorAccount} />
        <Route path="/vendor/bookings" component={VendorBookings} />
        <Route path="/vendor/listings" component={VendorListings} />
        <Route path="/vendor/listings/new" component={VendorCreateListing} />
        <Route path="/vendor/listings/:id" component={VendorListingEdit} />
        <Route path="/vendor/messages" component={VendorMessages} />
        <Route path="/vendor/payments" component={VendorPayments} />
        <Route path="/vendor/reviews" component={VendorReviews} />
        <Route path="/vendor/notifications" component={VendorNotifications} />
        <Route path="/vendor/:id" component={VendorProfile} />

        {/* Admin */}
        <Route path="/admin" component={AdminDashboard} />

        {/* Misc */}
        <Route path="/ui-demo" component={UIDemo} />
        <Route path="/auth-test" component={AuthTest} />

        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function AppContent() {
  useTrackPageView();
  return <Router />;
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
