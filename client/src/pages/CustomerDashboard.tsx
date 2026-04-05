import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
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
  MessageSquare,
  PlusCircle,
  Settings,
  User,
} from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { CustomerSidebar } from "@/components/customer-sidebar";
import BrandWordmark from "@/components/BrandWordmark";
import { ApiRequestError } from "@/lib/queryClient";
import { deriveVendorDetection, type VendorMeState } from "@/lib/vendorState";
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

function CustomerMobileNavLink({
  href,
  icon: Icon,
  label,
  currentPath,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  currentPath: string;
}) {
  const isActive =
    href === "/dashboard/profile"
      ? currentPath === "/dashboard" || currentPath.startsWith("/dashboard/profile")
      : currentPath.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${
        isActive ? "text-[#4a6a7d]" : "text-[#8fa2ad]"
      }`}
    >
      <Icon className={`h-5 w-5 ${isActive ? "text-[#4a6a7d]" : "text-[#8fa2ad]"}`} />
      {label}
    </Link>
  );
}

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
  const [lastKnownVendorAccount] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("eventhub:last-known-vendor-account") === "1";
  });

  // Fetch current customer
  const { data: customer, isLoading, error } = useQuery<Customer>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated,
    retry: false,
  });
  const {
    data: vendorAccount,
    isLoading: isVendorAccountLoading,
    isFetching: isVendorAccountFetching,
    error: vendorAccountError,
  } = useQuery<VendorMeState | null>({
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
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new ApiRequestError(res.status, text);
      }
      return res.json();
    },
  });
  const vendorDetection = deriveVendorDetection({
    data: vendorAccount,
    isLoading: isVendorAccountLoading,
    isFetching: isVendorAccountFetching,
    error: vendorAccountError,
  });

  const sidebarStyle = useMemo(
    () =>
      ({
        "--sidebar-width": "6rem",
        "--sidebar-width-icon": "6rem",
      }) as React.CSSProperties,
    []
  );

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      const returnTo =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : "/dashboard";
      setLocation(`/vendor/login?returnTo=${encodeURIComponent(returnTo)}`);
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
  const hasVendorAccount =
    vendorDetection.status === "vendor" ||
    (lastKnownVendorAccount &&
      (vendorDetection.status === "auth_error" || vendorDetection.status === "transient_error"));
  const shouldShowCustomerPhoto =
    !isVendorAccountLoading &&
    !isVendorAccountFetching &&
    !hasVendorAccount &&
    vendorDetection.status === "non_vendor";
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
      <div className="swap-dashboard-whites flex h-screen w-full flex-col">
        <header className="flex items-center justify-between border-b border-[rgba(74,106,125,0.22)] bg-[#ffffff] p-4">
          <Link
            href="/"
            className="flex items-center rounded-md px-1 py-1"
            data-testid="link-customer-shell-home"
          >
            <BrandWordmark
              className="text-[2.32rem]"
              eventClassName="text-[#e07a6a] font-normal"
              hubClassName="text-[#4a6a7d] font-normal"
            />
          </Link>

          <div className="flex items-center gap-3">
            <Button
              variant="default"
              className="no-global-scale editorial-login-btn min-h-0 h-[27px] min-w-[136px] rounded-[7px] px-3.5 py-0 text-[12.5px] leading-none gap-1 [&_svg]:!size-2"
              onClick={() => setLocation("/")}
              data-testid="button-back-marketplace"
            >
              <ArrowLeft />
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

        <div className="flex min-h-0 flex-1">
          <CustomerSidebar className="hidden lg:flex shrink-0" />
          <main className="flex-1 overflow-auto p-4 pb-20 lg:p-6 lg:pb-6">
            <div className="max-w-7xl mx-auto">
              {activeSection === "profile" && <CustomerProfile customer={customer} />}
              {activeSection === "events" && <CustomerEvents customer={customer} />}
              {activeSection === "messages" && <CustomerMessages customer={customer} />}
              {activeSection === "plan" && <CustomerPlanEvent />}
            </div>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2 py-2">
          <CustomerMobileNavLink href="/dashboard/events" icon={Calendar} label="Events" currentPath={location} />
          <CustomerMobileNavLink href="/dashboard/messages" icon={MessageSquare} label="Messages" currentPath={location} />
          <CustomerMobileNavLink href="/dashboard/plan" icon={PlusCircle} label="Plan Event" currentPath={location} />
          <CustomerMobileNavLink href="/dashboard/profile" icon={User} label="Profile" currentPath={location} />
        </nav>
      </div>
    </SidebarProvider>
  );
}
