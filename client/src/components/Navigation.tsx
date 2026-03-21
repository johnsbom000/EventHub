import { useAuth0 } from "@auth0/auth0-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import BrandWordmark from "@/components/BrandWordmark";
import AuthModal from "@/components/AuthModal";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  User,
  MessageSquare,
  Bell,
  Settings,
  Globe,
  HelpCircle,
  Home,
  LogOut,
  Calendar,
  Briefcase,
  Store,
} from "lucide-react";

type UserRole = "customer" | "vendor" | null;

interface VendorAccount {
  id: string;
  email: string;
  businessName: string;
}

interface Customer {
  id: string;
  name: string;
  displayName?: string | null;
  profilePhotoDataUrl?: string | null;
  email: string;
}

type NavigationProps = {
  showBottomBorder?: boolean;
  headerContent?: ReactNode;
  middleContent?: ReactNode;
  surfaceClassName?: string;
  vendorDashboardAligned?: boolean;
};

export default function Navigation({
  showBottomBorder = true,
  headerContent,
  middleContent,
  surfaceClassName,
  vendorDashboardAligned = false,
}: NavigationProps) {
  const [location, setLocation] = useLocation();
  const hideAvatarNotifications = location === "/";
  const isVendorOnboardingRoute = location.startsWith("/vendor/onboarding");
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { isAuthenticated, user, logout: auth0Logout } = useAuth0();
  useEffect(() => {
    if (user) console.log("AUTH0 USER OBJECT:", user);
  }, [user]);

  // Fetch vendor account if vendor token exists (legacy)
  const { getAccessTokenSilently } = useAuth0();

  const {
    data: vendorAccount,
    isLoading: vendorMeLoading,
    isError: vendorMeError,
  } = useQuery<VendorAccount>({
    queryKey: ["/api/vendor/me"],     // ✅ MUST be only this
    enabled: isAuthenticated,
    retry: false,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Fetch customer account if customer token exists (legacy)
  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated && !vendorMeLoading && !vendorAccount,
    retry: false,
  });

  // Update user role based on fetched data (legacy)
  useEffect(() => {
    if (!isAuthenticated) {
      setUserRole(null);
      return;
    }
    if (vendorMeLoading) return;
    if (vendorAccount) setUserRole("vendor");
    else setUserRole("customer");
  }, [isAuthenticated, vendorAccount, vendorMeLoading]);



  // If Auth0 says you're authenticated but legacy tokens/role aren't set yet,
  // treat the user as "customer" so the UI doesn't look logged out.
  // (Later you'll map Auth0 -> vendor/customer via backend.)

  const handleLogout = () => {
    // Clear legacy tokens
    localStorage.removeItem("vendorToken");
    localStorage.removeItem("vendorAccountId");
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customerId");

    setUserRole(null);

    // Auth0 logout
    auth0Logout({
      logoutParams: { returnTo: window.location.origin },
    });
  };

  // Get initials for avatar
  const getInitials = (name: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get display name based on role (fallback to Auth0)
  const getDisplayName = () => {
    if (userRole === "vendor" && vendorAccount) {
      return vendorAccount.businessName;
    } else if (userRole === "customer" && customer) {
      return customer.displayName?.trim() || customer.name;
    }
    // Auth0 fallback
    const auth0Name =
      (user as any)?.name ||
      (user as any)?.nickname ||
      (user as any)?.email ||
      "";
    return auth0Name;
  };

  const isLoggedIn = isAuthenticated || !!userRole;
  const navActionButtonClass = "rounded-md px-3 font-sans text-[1.11rem] font-bold text-[#4a6a7d] dark:text-[#f5f0e8]";
  const backToMarketplaceNavButtonClass =
    "no-global-scale min-h-0 h-5 rounded-[4px] px-2 py-0 font-sans text-[12.5px] leading-none font-medium text-[#4a6a7d] dark:text-[#f5f0e8] gap-1 [&_svg]:!size-2";
  const navContainerClass = vendorDashboardAligned ? "w-full" : "w-full px-6 lg:px-10";
  const navRowClass = vendorDashboardAligned ? "flex items-center p-4" : "flex min-h-16 items-center py-2";
  const homeLinkClass = vendorDashboardAligned
    ? "flex items-center rounded-md px-1 py-1"
    : "flex items-center gap-2 px-3 py-2 rounded-md -ml-3";
  const brandWordmarkClass = vendorDashboardAligned ? "text-[2.32rem]" : "text-[2.72rem]";
  const navPositionClass = vendorDashboardAligned ? "" : "sticky top-0";

  return (
    <nav
      className={cn(
        navPositionClass,
        "z-50 bg-[#ffffff] dark:bg-[#16222d]",
        showBottomBorder ? "border-b border-[rgba(74,106,125,0.15)]" : "",
        surfaceClassName
      )}
    >
      <div className={navContainerClass}>
        <div className={navRowClass}>
          <Link
            href="/"
            className={homeLinkClass}
            data-testid="link-home"
          >
            <BrandWordmark
              className={brandWordmarkClass}
              eventClassName="text-[#e07a6a] font-normal"
              hubClassName="text-[#4a6a7d] font-normal"
            />
          </Link>

          {middleContent ? <div className="mx-6 min-w-0 flex-1">{middleContent}</div> : null}

          <div className="ml-auto flex items-center gap-4">
            {/* Auth Modal */}
            <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />

            {/* Logged Out State */}
            {!isLoggedIn && (
              <Button
                variant="default"
                size="default"
                className="editorial-login-btn min-h-0 h-[27px] min-w-[116px] rounded-[7px] px-3.5 py-0 text-[1.15rem] leading-none"
                onClick={() => setAuthModalOpen(true)}
                data-testid="button-login-signup"
              >
                Login / Sign up
              </Button>
            )}

            {/* Vendor Logged In State */}
            {isLoggedIn && userRole === "vendor" && (
              <>
                <Link href="/vendor/dashboard">
                  <Button
                    variant="ghost"
                    size="default"
                    className={navActionButtonClass}
                    data-testid="link-vendor-dashboard"
                  >
                    Vendor Dashboard
                  </Button>
                </Link>

                {location.startsWith("/dashboard") ? (
                  <Link href="/">
                    <Button
                      variant="ghost"
                      size="default"
                      className={backToMarketplaceNavButtonClass}
                      data-testid="link-vendor-back-to-marketplace"
                    >
                      <Store />
                      Back to Marketplace
                    </Button>
                  </Link>
                ) : (
                  <Link href="/dashboard/events">
                    <Button
                      variant="ghost"
                      size="default"
                      className={navActionButtonClass}
                      data-testid="link-vendor-my-events"
                    >
                      My Events
                    </Button>
                  </Link>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      data-testid="button-vendor-profile"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getInitials(getDisplayName())}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-60 shadow-lg"
                    data-testid="dropdown-vendor-menu"
                  >
                    <DropdownMenuLabel>Vendor Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLocation("/vendor/dashboard")}
                      data-testid="menu-item-profile"
                    >
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/dashboard/events")}
                      data-testid="menu-item-vendor-my-events"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      <span>My Events</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/vendor/dashboard")}
                      data-testid="menu-item-vendor-dashboard"
                    >
                      <Home className="mr-2 h-4 w-4" />
                      <span>Vendor Dashboard</span>
                    </DropdownMenuItem>
                    {!hideAvatarNotifications ? (
                      <DropdownMenuItem
                        onClick={() => setLocation("/vendor/notifications")}
                        data-testid="menu-item-notifications"
                      >
                        <Bell className="mr-2 h-4 w-4" />
                        <span>Notifications</span>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLocation("/vendor/dashboard")}
                      data-testid="menu-item-account-settings"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Account settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="menu-item-languages">
                      <Globe className="mr-2 h-4 w-4" />
                      <span>Languages & currency</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem data-testid="menu-item-help">
                      <HelpCircle className="mr-2 h-4 w-4" />
                      <span>Help Center</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleLogout}
                      data-testid="menu-item-sign-out"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {/* Customer Logged In State */}
            {isLoggedIn && userRole !== "vendor" && (
              <>
                {userRole === "customer" && !isVendorOnboardingRoute ? (
                  <Button
                    variant="ghost"
                    size="default"
                    className={navActionButtonClass}
                    onClick={() => setLocation("/vendor/onboarding")}
                    data-testid="button-become-vendor-nav"
                  >
                    Become a Vendor
                  </Button>
                ) : null}

                {location.startsWith("/dashboard") ? (
                  <Link href="/">
                    <Button
                      variant="ghost"
                      size="default"
                      className={backToMarketplaceNavButtonClass}
                      data-testid="link-back-to-marketplace"
                    >
                      <Store />
                      Back to Marketplace
                    </Button>
                  </Link>
                ) : (
                  <Link href="/dashboard">
                    <Button
                      variant="ghost"
                      size="default"
                      className={navActionButtonClass}
                      data-testid="link-my-events"
                    >
                      My Events
                    </Button>
                  </Link>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      data-testid="button-customer-profile"
                    >
                      <Avatar className="h-8 w-8">
                        {customer?.profilePhotoDataUrl && (
                          <AvatarImage
                            src={customer.profilePhotoDataUrl}
                            alt="Customer profile photo"
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {getInitials(getDisplayName())}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-60 shadow-lg"
                    data-testid="dropdown-customer-menu"
                  >
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLocation("/dashboard")}
                      data-testid="menu-item-profile"
                    >
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/dashboard")}
                      data-testid="menu-item-messages"
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      <span>Messages</span>
                    </DropdownMenuItem>
                    {!hideAvatarNotifications ? (
                      <DropdownMenuItem
                        onClick={() => setLocation("/dashboard")}
                        data-testid="menu-item-notifications"
                      >
                        <Bell className="mr-2 h-4 w-4" />
                        <span>Notifications</span>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLocation("/vendor/onboarding")}
                      data-testid="menu-item-become-vendor"
                    >
                      <Briefcase className="mr-2 h-4 w-4" />
                      <span>Become a Vendor</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLocation("/dashboard")}
                      data-testid="menu-item-account-settings"
                    >
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Account settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem data-testid="menu-item-languages">
                      <Globe className="mr-2 h-4 w-4" />
                      <span>Languages & currency</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem data-testid="menu-item-help">
                      <HelpCircle className="mr-2 h-4 w-4" />
                      <span>Help Center</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleLogout}
                      data-testid="menu-item-sign-out"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>
      {headerContent}
    </nav>
  );
}
