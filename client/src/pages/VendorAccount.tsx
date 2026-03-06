import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, DollarSign, Users, TrendingUp, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { redirectVendorToStripeSetup } from "@/lib/vendorStripe";

/**
 * Typed responses from the API
 * These match what your backend actually returns today
 */

type VendorMe = {
  businessName?: string | null;
  stripeOnboardingComplete?: boolean | null;
};

type VendorStats = {
  totalBookings?: number | null;
  bookingsThisMonth?: number | null;
  revenue?: number | null;
  revenueGrowth?: number | null;
  profileViews?: number | null;
  profileViewsGrowth?: number | null;
};

export default function VendorAccount() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isStripeSetupLoading, setIsStripeSetupLoading] = useState(false);

  const { data: vendorAccount, isLoading: isVendorLoading } = useQuery<VendorMe>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated,
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery<VendorStats>({
    queryKey: ["/api/vendor/stats"],
    enabled: isAuthenticated,
  });

  const handleCompletePaymentSetup = async () => {
    try {
      setIsStripeSetupLoading(true);
      await redirectVendorToStripeSetup();
    } catch (error: any) {
      setIsStripeSetupLoading(false);
      toast({
        title: "Unable to open Stripe setup",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      const returnTo =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : location || "/vendor/account";
      setLocation(`/vendor/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isAuthLoading, isAuthenticated, location, setLocation]);

  if (isAuthLoading || isVendorLoading || isStatsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <VendorSidebar />

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <Button
              variant="default"
              className="no-global-scale editorial-login-btn h-[54px] min-w-[232px] px-7 text-[1.15rem] leading-none"
              onClick={() => setLocation("/")}
              data-testid="button-back-marketplace"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Button>
          </header>

          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div>
                <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
                  Dashboard
                </h1>
                <p className="text-muted-foreground">
                  Welcome back, {vendorAccount?.businessName || "Vendor"}!
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[20px]">Total Bookings</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stats?.totalBookings ?? 0}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      +{stats?.bookingsThisMonth ?? 0} this month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[20px]">Revenue</CardTitle>
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${(stats?.revenue ?? 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      +{stats?.revenueGrowth ?? 0}% from last month
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[20px]">Profile Views</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {(stats?.profileViews ?? 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      +{stats?.profileViewsGrowth ?? 0}% this week
                    </p>
                  </CardContent>
                </Card>
              </div>

              {!vendorAccount?.stripeOnboardingComplete && (
                <Card className="border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)]">
                  <CardHeader>
                    <CardTitle className="text-[20px]">Complete Your Setup</CardTitle>
                    <CardDescription>
                      Connect your Stripe account to start accepting payments from customers.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={handleCompletePaymentSetup}
                      disabled={isStripeSetupLoading}
                      data-testid="button-complete-setup"
                    >
                      {isStripeSetupLoading ? "Opening Stripe..." : "Complete Payment Setup"}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Your latest bookings and inquiries</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No recent bookings yet. Your upcoming bookings will appear here.
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
