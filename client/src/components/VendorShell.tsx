import React, { useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  Check,
  DollarSign,
  Globe,
  HelpCircle,
  Home,
  LayoutGrid,
  Loader2,
  LogOut,
  MessageSquare,
  Settings,
  User,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { VendorSidebar } from "@/components/vendor-sidebar";
import BrandWordmark from "@/components/BrandWordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth0 } from "@auth0/auth0-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type VendorShellProps = {
  children: React.ReactNode;
  onOpenAccountSettings?: () => void;
};

type VendorHeaderAccount = {
  businessName?: string | null;
  email?: string | null;
};

type VendorProfileSummary = {
  id: string;
  profileName: string;
  isActive: boolean;
};

type VendorProfilesResponse = {
  activeProfileId?: string | null;
  profiles?: VendorProfileSummary[];
};

function MobileNavLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/vendor/dashboard" && location.startsWith(href));
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

function getInitialsFromName(nameOrEmail: string) {
  const value = (nameOrEmail || "").trim();
  if (!value) return "V";
  const words = value
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return "V";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

export default function VendorShell({ children, onOpenAccountSettings }: VendorShellProps) {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading, getAccessTokenSilently, logout } = useAuth0();
  const queryClient = useQueryClient();

  const { data: vendorAccount } = useQuery<VendorHeaderAccount>({
    queryKey: ["/api/vendor/me", "shell-header"],
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: "https://eventhub-api" },
      });
      const res = await fetch("/api/vendor/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`vendor /me failed: ${res.status}`);
      return res.json();
    },
  });

  const { data: vendorProfilesData } = useQuery<VendorProfilesResponse>({
    queryKey: ["/api/vendor/profiles", "shell-header"],
    enabled: isAuthenticated,
    retry: false,
    queryFn: async () => {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: "https://eventhub-api" },
      });
      const res = await fetch("/api/vendor/profiles", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return { profiles: [] };
      }
      return res.json();
    },
  });

  const vendorProfiles = Array.isArray(vendorProfilesData?.profiles) ? vendorProfilesData!.profiles! : [];
  const activeProfileId =
    (typeof vendorProfilesData?.activeProfileId === "string" && vendorProfilesData.activeProfileId.trim()) ||
    vendorProfiles.find((profile) => profile.isActive)?.id ||
    "";
  const activeProfileName =
    vendorProfiles.find((profile) => profile.id === activeProfileId)?.profileName ||
    vendorAccount?.businessName ||
    "Vendor Profile";

  const switchVendorProfile = async (profileId: string) => {
    const token = await getAccessTokenSilently({
      authorizationParams: { audience: "https://eventhub-api" },
    });
    const res = await fetch("/api/vendor/profiles/switch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ profileId }),
    });
    if (!res.ok) return;

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profiles"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/listings"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/payments"] }),
    ]);
  };

  const displayName = activeProfileName || vendorAccount?.email || "Vendor";
  const initials = getInitialsFromName(displayName);

  const sidebarStyle = {
    "--sidebar-width": "6rem",
    "--sidebar-width-icon": "6rem",
  } as React.CSSProperties;

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      const returnTo =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}${window.location.hash}`
          : location || "/vendor/dashboard";
      setLocation(`/vendor/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [isAuthLoading, isAuthenticated, location, setLocation]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="swap-dashboard-whites flex h-screen w-full flex-col">
        <header className="flex items-center justify-between border-b border-[rgba(74,106,125,0.22)] bg-[#ffffff] p-4">
          <Link
            href="/"
            className="flex items-center rounded-md px-1 py-1"
            data-testid="link-vendor-shell-home"
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
                  data-testid="button-vendor-shell-profile"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-64"
                data-testid="dropdown-vendor-shell-menu"
              >
                <DropdownMenuLabel>Vendor Account</DropdownMenuLabel>
                <DropdownMenuLabel className="pt-0 text-xs font-normal text-muted-foreground">
                  Active: {activeProfileName}
                </DropdownMenuLabel>
                {vendorProfiles.length > 0 ? (
                  <>
                    {vendorProfiles.map((profile) => (
                      <DropdownMenuItem
                        key={profile.id}
                        onClick={() => {
                          void switchVendorProfile(profile.id);
                        }}
                        data-testid={`menu-item-vendor-profile-${profile.id}`}
                      >
                        <span className="truncate">{profile.profileName}</span>
                        {profile.id === activeProfileId ? <Check className="ml-auto h-4 w-4" /> : null}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                <DropdownMenuItem
                  onClick={() => setLocation("/vendor/onboarding?createProfile=1")}
                  data-testid="menu-item-vendor-create-profile"
                >
                  <span>Create another profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => setLocation("/vendor/dashboard")}
                  data-testid="menu-item-vendor-shell-profile"
                >
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/dashboard/events")}
                  data-testid="menu-item-vendor-shell-my-events"
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>My Events</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocation("/vendor/dashboard")}
                  data-testid="menu-item-vendor-shell-dashboard"
                >
                  <Home className="mr-2 h-4 w-4" />
                  <span>Vendor Dashboard</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => {
                    if (onOpenAccountSettings) {
                      onOpenAccountSettings();
                      return;
                    }
                    setLocation("/vendor/dashboard");
                  }}
                  data-testid="menu-item-vendor-shell-account-settings"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Account settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menu-item-vendor-shell-languages">
                  <Globe className="mr-2 h-4 w-4" />
                  <span>Languages & currency</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem data-testid="menu-item-vendor-shell-help">
                  <HelpCircle className="mr-2 h-4 w-4" />
                  <span>Help Center</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    logout({ logoutParams: { returnTo: window.location.origin } });
                  }}
                  data-testid="menu-item-vendor-shell-sign-out"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <VendorSidebar className="hidden lg:flex shrink-0" />
          <main className="flex-1 overflow-auto p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>
        </div>

        {/* Mobile bottom navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2 py-2">
          <MobileNavLink href="/vendor/dashboard" icon={Home} label="Dashboard" />
          <MobileNavLink href="/vendor/bookings" icon={Calendar} label="Bookings" />
          <MobileNavLink href="/vendor/listings" icon={LayoutGrid} label="Listings" />
          <MobileNavLink href="/vendor/messages" icon={MessageSquare} label="Messages" />
          <MobileNavLink href="/vendor/payments" icon={DollarSign} label="Payments" />
        </nav>
      </div>
    </SidebarProvider>
  );
}
