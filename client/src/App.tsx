import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import BrowseVendors from "@/pages/BrowseVendors";
import VendorProfile from "@/pages/VendorProfile";
import EventPlanner from "@/pages/EventPlanner";
import CuratedRecommendations from "@/pages/CuratedRecommendations";
import VendorDashboard from "@/pages/VendorDashboard";
import VendorLogin from "@/pages/VendorLogin";
import VendorSignup from "@/pages/VendorSignup";
import VendorOnboarding from "@/pages/VendorOnboarding";
import VendorBookings from "@/pages/VendorBookings";
import VendorListings from "@/pages/VendorListings";
import VendorMessages from "@/pages/VendorMessages";
import VendorCalendar from "@/pages/VendorCalendar";
import VendorPayments from "@/pages/VendorPayments";
import VendorReviews from "@/pages/VendorReviews";
import VendorNotifications from "@/pages/VendorNotifications";
import AdminDashboard from "@/pages/AdminDashboard";
import UIDemo from "@/pages/UIDemo";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Login} />
      <Route path="/browse" component={BrowseVendors} />
      <Route path="/vendor/login" component={VendorLogin} />
      <Route path="/vendor/signup" component={VendorSignup} />
      <Route path="/vendor/onboarding" component={VendorOnboarding} />
      <Route path="/vendor/dashboard" component={VendorDashboard} />
      <Route path="/vendor/bookings" component={VendorBookings} />
      <Route path="/vendor/listings" component={VendorListings} />
      <Route path="/vendor/messages" component={VendorMessages} />
      <Route path="/vendor/calendar" component={VendorCalendar} />
      <Route path="/vendor/payments" component={VendorPayments} />
      <Route path="/vendor/reviews" component={VendorReviews} />
      <Route path="/vendor/notifications" component={VendorNotifications} />
      <Route path="/vendor/:id" component={VendorProfile} />
      <Route path="/planner" component={EventPlanner} />
      <Route path="/recommendations/:eventId" component={CuratedRecommendations} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/ui-demo" component={UIDemo} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
