import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import Logo from "@/components/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  MessageSquare,
  Bell,
  Settings,
  Globe,
  HelpCircle,
  LogOut,
  LayoutDashboard,
  Calendar,
  Briefcase,
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
  email: string;
}

export default function Navigation() {
  const [,setLocation] = useLocation();
  const [userRole, setUserRole] = useState<UserRole>(null);

  // Fetch vendor account if vendor token exists
  const { data: vendorAccount } = useQuery<VendorAccount>({
    queryKey: ["/api/vendor/me"],
    enabled: !!localStorage.getItem("vendorToken"),
    retry: false,
  });

  // Fetch customer account if customer token exists
  const { data: customer } = useQuery<Customer>({
    queryKey: ["/api/customer/me"],
    enabled: !!localStorage.getItem("customerToken"),
    retry: false,
  });

  // Update user role based on fetched data
  useEffect(() => {
    if (vendorAccount) {
      setUserRole("vendor");
    } else if (customer) {
      setUserRole("customer");
    } else {
      setUserRole(null);
    }
  }, [vendorAccount, customer]);

  const handleLogout = () => {
    if (userRole === "vendor") {
      localStorage.removeItem("vendorToken");
      localStorage.removeItem("vendorAccountId");
    } else if (userRole === "customer") {
      localStorage.removeItem("customerToken");
      localStorage.removeItem("customerId");
    }
    setUserRole(null);
    setLocation("/");
    // Refresh the page to clear all state
    window.location.reload();
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

  // Get display name based on role
  const getDisplayName = () => {
    if (userRole === "vendor" && vendorAccount) {
      return vendorAccount.businessName;
    } else if (userRole === "customer" && customer) {
      return customer.name;
    }
    return "";
  };

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link
            href="/"
            className="flex items-center gap-2 hover-elevate active-elevate-2 px-3 py-2 rounded-lg -ml-3"
            data-testid="link-home"
          >
            <Logo className="h-6 w-6" />
            <span className="font-serif text-xl font-bold">Event Hub</span>
          </Link>

          <div className="flex items-center gap-4">
            {/* Logged Out State */}
            {!userRole && (
              <>
                <Link href="/signup">
                  <Button
                    variant="ghost"
                    size="default"
                    data-testid="button-become-vendor"
                  >
                    Become a vendor
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button
                    variant="default"
                    size="default"
                    className="bg-primary"
                    data-testid="button-login-signup"
                  >
                    Login / Sign up
                  </Button>
                </Link>
              </>
            )}

            {/* Vendor Logged In State */}
            {userRole === "vendor" && (
              <>
                <Link href="/vendor/dashboard">
                  <Button
                    variant="ghost"
                    size="default"
                    data-testid="link-vendor-dashboard"
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Vendor Dashboard
                  </Button>
                </Link>

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
                    className="w-56"
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
                      onClick={() => setLocation("/vendor/messages")}
                      data-testid="menu-item-messages"
                    >
                      <MessageSquare className="mr-2 h-4 w-4" />
                      <span>Messages</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLocation("/vendor/notifications")}
                      data-testid="menu-item-notifications"
                    >
                      <Bell className="mr-2 h-4 w-4" />
                      <span>Notifications</span>
                    </DropdownMenuItem>
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
            {userRole === "customer" && (
              <>
                <Link href="/dashboard">
                  <Button
                    variant="ghost"
                    size="default"
                    data-testid="link-my-events"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    My Events
                  </Button>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      data-testid="button-customer-profile"
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
                    className="w-56"
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
                    <DropdownMenuItem
                      onClick={() => setLocation("/dashboard")}
                      data-testid="menu-item-notifications"
                    >
                      <Bell className="mr-2 h-4 w-4" />
                      <span>Notifications</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setLocation("/signup")}
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
    </nav>
  );
}
