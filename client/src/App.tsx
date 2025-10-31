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
import AdminDashboard from "@/pages/AdminDashboard";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Login} />
      <Route path="/browse" component={BrowseVendors} />
      <Route path="/vendor/:id" component={VendorProfile} />
      <Route path="/planner" component={EventPlanner} />
      <Route path="/recommendations/:eventId" component={CuratedRecommendations} />
      <Route path="/vendor/dashboard" component={VendorDashboard} />
      <Route path="/vendor/signup" component={Login} />
      <Route path="/admin" component={AdminDashboard} />
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
