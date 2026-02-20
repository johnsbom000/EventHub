import { Calendar, Home, LayoutGrid, MessageSquare, DollarSign, Star, Bell, Settings, Menu } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth0 } from "@auth0/auth0-react";

interface VendorAccount {
  businessName: string;
  email: string;
  // Add other vendor account properties as needed
}

const menuItems = [
  {
    title: "Dashboard",
    url: "/vendor/dashboard",
    icon: Home,
  },
  {
    title: "Bookings",
    url: "/vendor/bookings",
    icon: Calendar,
  },
  {
    title: "Listings",
    url: "/vendor/listings",
    icon: LayoutGrid,
  },
  {
    title: "Payments",
    url: "/vendor/payments",
    icon: DollarSign,
  },
  {
    title: "Reviews",
    url: "/vendor/reviews",
    icon: Star,
  },
  {
    title: "Notifications",
    url: "/vendor/notifications",
    icon: Bell,
  },
];

export function VendorSidebar() {
  const [location] = useLocation();
  
    const { isAuthenticated, getAccessTokenSilently } = useAuth0();

    const { data: vendorAccount } = useQuery<VendorAccount>({
      queryKey: ["/api/vendor/me", isAuthenticated ? "auth" : "anon"],
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

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Menu className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">Event Hub</span>
            <span className="text-xs text-muted-foreground">Vendor Portal</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {vendorAccount?.businessName?.[0]?.toUpperCase() || "V"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">
              {vendorAccount?.businessName || "Vendor"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {vendorAccount?.email}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
