import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import {
  ArrowLeft,
  Calendar,
  Globe,
  HelpCircle,
  Home,
  Loader2,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { CustomerSidebar } from "@/components/customer-sidebar";
import CustomerProfile from "./customer/CustomerProfile";
import CustomerEvents from "./customer/CustomerEvents";
import CustomerMessages from "./customer/CustomerMessages";
import CustomerPlanEvent from "./customer/CustomerPlanEvent";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Customer {
  id: string;
  name: string;
  displayName?: string | null;
  profilePhotoDataUrl?: string | null;
  email: string;
  createdAt: string;
}

type Section = "profile" | "events" | "messages" | "plan";

function getPersonInitials(value: string) {
  const normalized = (value || "").trim();
  if (!normalized) return "C";
  const parts = normalized
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0] || "";
  const last = parts[parts.length - 1][0] || "";
  return `${first}${last}`.toUpperCase();
}

export default function CustomerDashboard() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading, getAccessTokenSilently, logout } = useAuth0();

  // Fetch current customer
  const { data: customer, isLoading, error } = useQuery<Customer>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated,
    retry: false,
  });
  const { data: vendorAccount, isLoading: isVendorAccountLoading } = useQuery<{ id: string } | null>({
    queryKey: ["/api/vendor/me", "customer-dashboard-header"],
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: "https://eventhub-api" },
      });
      const res = await fetch("/api/vendor/me", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": "16rem",
        "--sidebar-width-icon": "3rem",
      }) as React.CSSProperties,
    []
  );

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  // Derive active section from URL (single source of truth)
  const activeSection = useMemo<Section>(() => {
    if (location.startsWith("/dashboard/events")) return "events";
    if (location.startsWith("/dashboard/messages")) return "messages";
    if (location.startsWith("/dashboard/plan")) return "plan";
    // Default to profile for /dashboard and /dashboard/profile
    return "profile";
  }, [location]);
  const hasVendorAccount = Boolean(vendorAccount?.id);
  const shouldShowCustomerPhoto = !isVendorAccountLoading && !hasVendorAccount;
  const realName = customer?.displayName?.trim() || customer?.name || "Customer";
  const initials = getPersonInitials(realName);

  if (isLoading || isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    const errorMessage =
      error instanceof Error ? error.message : "We are setting up your customer profile. Refresh in a few seconds if this does not update.";

    return (
      <div className="swap-dashboard-whites min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="rounded-xl border border-border bg-card p-6">
            <h1 className="text-2xl font-semibold mb-2">Loading your dashboard</h1>
            <p className="text-muted-foreground">
              {errorMessage}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="swap-dashboard-whites flex h-screen w-full">
        <CustomerSidebar />

        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-3">
              <Button
                variant="default"
                className="no-global-scale editorial-login-btn h-[54px] min-w-[232px] px-7 text-[1.15rem] leading-none"
                onClick={() => setLocation("/")}
                data-testid="button-back-marketplace"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Marketplace
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full p-0"
                    data-testid="button-customer-dashboard-profile"
                  >
                    <Avatar
                      key={hasVendorAccount ? "vendor-avatar" : "customer-avatar"}
                      className="h-10 w-10"
                    >
                      {shouldShowCustomerPhoto && customer.profilePhotoDataUrl ? (
                        <AvatarImage
                          src={customer.profilePhotoDataUrl}
                          alt="Customer profile photo"
                          className="object-cover"
                        />
                      ) : null}
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64"
                  data-testid="dropdown-customer-dashboard-menu"
                >
                  <DropdownMenuLabel>{hasVendorAccount ? "Vendor Account" : "My Account"}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setLocation(hasVendorAccount ? "/vendor/dashboard" : "/dashboard/profile")}
                    data-testid="menu-item-customer-dashboard-profile"
                  >
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setLocation("/dashboard/events")}
                    data-testid="menu-item-customer-dashboard-events"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    <span>My Events</span>
                  </DropdownMenuItem>
                  {hasVendorAccount ? (
                    <DropdownMenuItem
                      onClick={() => setLocation("/vendor/dashboard")}
                      data-testid="menu-item-customer-dashboard-vendor-dashboard"
                    >
                      <Home className="mr-2 h-4 w-4" />
                      <span>Vendor Dashboard</span>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setLocation(hasVendorAccount ? "/vendor/dashboard" : "/dashboard/profile")}
                    data-testid="menu-item-customer-dashboard-account-settings"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Account settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-item-customer-dashboard-languages">
                    <Globe className="mr-2 h-4 w-4" />
                    <span>Languages & currency</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menu-item-customer-dashboard-help">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    <span>Help Center</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                    data-testid="menu-item-customer-dashboard-sign-out"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              {activeSection === "profile" && <CustomerProfile customer={customer} />}
              {activeSection === "events" && <CustomerEvents customer={customer} />}
              {activeSection === "messages" && <CustomerMessages customer={customer} />}
              {activeSection === "plan" && <CustomerPlanEvent />}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
