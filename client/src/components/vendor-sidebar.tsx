import { Calendar, Home, LayoutGrid, MessageSquare, DollarSign, Star, Bell, Settings } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useAuth0 } from "@auth0/auth0-react";
import BrandWordmark from "@/components/BrandWordmark";
import { cn } from "@/lib/utils";

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
    title: "Messages",
    url: "/vendor/messages",
    icon: MessageSquare,
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

export function VendorSidebar({ className }: { className?: string } = {}) {
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

    const { data: unreadData } = useQuery<{ unreadCount: number }>({
      queryKey: ["/api/vendor/messages/unread-count"],
      enabled: isAuthenticated,
      refetchInterval: 10000,
      staleTime: 0,
    });

    const unreadCount = Math.max(0, Number(unreadData?.unreadCount || 0));

  return (
    <Sidebar className={cn(className)}>
      <SidebarHeader className="p-4">
        <div className="flex flex-col">
          <BrandWordmark className="text-[1.9rem]" />
          <span className="text-xs text-muted-foreground">Vendor Portal</span>
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
                      {item.title === "Messages" && unreadCount > 0 ? (
                        <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
                          {unreadCount}
                        </Badge>
                      ) : null}
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
