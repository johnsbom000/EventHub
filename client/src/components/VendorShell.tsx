import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  Globe,
  HelpCircle,
  Home,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { useLocation } from "wouter";
import { VendorSidebar } from "@/components/vendor-sidebar";
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
import { useQuery } from "@tanstack/react-query";

type VendorShellProps = {
  children: React.ReactNode;
};

type VendorHeaderAccount = {
  businessName?: string | null;
  email?: string | null;
};

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

export default function VendorShell({ children }: VendorShellProps) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, getAccessTokenSilently, logout } = useAuth0();

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

  const displayName = vendorAccount?.businessName || vendorAccount?.email || "Vendor";
  const initials = getInitialsFromName(displayName);

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="swap-dashboard-whites flex h-screen w-full">
        <VendorSidebar />
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
                    onClick={() => setLocation("/vendor/dashboard")}
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

          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
