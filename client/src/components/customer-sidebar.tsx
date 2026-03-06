import { Calendar, MessageSquare, PlusCircle, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import BrandWordmark from "@/components/BrandWordmark";
import { cn } from "@/lib/utils";

interface CustomerMe {
  id: string;
  name: string;
  displayName?: string | null;
  email: string;
}

const menuItems = [
  {
    title: "My Events",
    url: "/dashboard/events",
    icon: Calendar,
  },
  {
    title: "Messages",
    url: "/dashboard/messages",
    icon: MessageSquare,
  },
  {
    title: "Plan New Event",
    url: "/dashboard/plan",
    icon: PlusCircle,
  },
  {
    title: "My profile",
    url: "/dashboard/profile",
    icon: User,
  },
];

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "C"
  );
}

function isMenuItemActive(currentPath: string, itemUrl: string) {
  if (itemUrl === "/dashboard/profile") {
    return currentPath === "/dashboard" || currentPath.startsWith("/dashboard/profile");
  }
  return currentPath.startsWith(itemUrl);
}

export function CustomerSidebar({ className }: { className?: string } = {}) {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth0();

  const { data: customer } = useQuery<CustomerMe>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/customer/messages/unread-count"],
    enabled: isAuthenticated,
    refetchInterval: 10000,
    staleTime: 0,
  });

  const unreadCount = Math.max(0, Number(unreadData?.unreadCount || 0));
  const displayName = customer?.displayName?.trim() || customer?.name || "Customer";

  return (
    <Sidebar className={cn(className)}>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex w-fit flex-col" data-testid="link-customer-home">
          <BrandWordmark className="text-[1.9rem]" />
          <span className="text-xs text-muted-foreground">Customer Portal</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isMenuItemActive(location, item.url)}>
                    <Link href={item.url} data-testid={`link-customer-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
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
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{customer?.email || ""}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
