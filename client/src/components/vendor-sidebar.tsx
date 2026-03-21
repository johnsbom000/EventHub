import { Calendar, Home, LayoutGrid, MessageSquare, DollarSign, Star, Bell, Store } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth0 } from "@auth0/auth0-react";
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
  {
    title: "My Hub",
    url: "/vendor/shop",
    icon: Store,
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
    <Sidebar
      collapsible="none"
      className={cn(
        "relative z-20 border-r border-[rgba(74,106,125,0.22)] bg-[#ffffff] dark:bg-[#ffffff]",
        className
      )}
    >
      <SidebarContent className="items-center overflow-y-auto overflow-x-visible px-0 pt-6">
        <SidebarGroup className="px-0">
          <SidebarGroupContent>
            <SidebarMenu className="items-center gap-3">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title} className="group/menu-item relative overflow-visible">
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    tooltip={{
                      children: item.title,
                      hidden: false,
                      side: "right",
                      align: "center",
                      className:
                        "border border-[rgba(74,106,125,0.22)] bg-[#ffffff] text-[#2a3a42]",
                    }}
                    className={cn(
                      "h-14 w-14 justify-center rounded-2xl p-0",
                      location === item.url
                        ? "bg-[#4a6a7d] text-[#f5f0e8] hover:bg-[#4a6a7d] hover:text-[#f5f0e8]"
                        : "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
                    )}
                  >
                    <Link
                      href={item.url}
                      className="relative flex h-14 w-14 items-center justify-center"
                      data-testid={`link-${item.title.toLowerCase()}`}
                    >
                      <item.icon className="!h-8 !w-8" />
                      <span className="sr-only">{item.title}</span>
                      {item.title === "Messages" && unreadCount > 0 ? (
                        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#e07a6a] px-1 text-center text-[11px] font-semibold leading-4 text-[#f5f0e8]">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : null}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="mt-auto px-2 pb-4 pt-2">
        <div className="group/footer relative mx-auto">
          <Avatar className="h-11 w-11 border border-[rgba(74,106,125,0.22)]">
            <AvatarFallback className="bg-[#4a6a7d] text-[#f5f0e8] text-xs">
              {vendorAccount?.businessName?.[0]?.toUpperCase() || "V"}
            </AvatarFallback>
          </Avatar>
          <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 rounded-md border border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2.5 py-1 text-sm font-medium whitespace-nowrap text-[#2a3a42] opacity-0 shadow-sm transition-opacity duration-150 group-hover/footer:opacity-100">
            {vendorAccount?.businessName || "Vendor"}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
