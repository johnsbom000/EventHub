import { Calendar, MessageSquare, PlusCircle, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

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
import { Badge } from "@/components/ui/badge";
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
                    isActive={isMenuItemActive(location, item.url)}
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
                      isMenuItemActive(location, item.url)
                        ? "bg-[#4a6a7d] text-[#f5f0e8] hover:bg-[#4a6a7d] hover:text-[#f5f0e8]"
                        : "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
                    )}
                  >
                    <Link
                      href={item.url}
                      className="relative flex h-14 w-14 items-center justify-center"
                      data-testid={`link-customer-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="!h-8 !w-8" />
                      <span className="sr-only">{item.title}</span>
                      {item.title === "Messages" && unreadCount > 0 ? (
                        <Badge
                          variant="secondary"
                          className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
                        >
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
      <SidebarFooter className="mt-auto px-2 pb-4 pt-2">
        <div className="group/footer relative mx-auto">
          <Avatar className="h-11 w-11 border border-[rgba(74,106,125,0.22)]">
            <AvatarFallback className="bg-[#4a6a7d] text-[#f5f0e8] text-xs">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 rounded-md border border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2.5 py-1 text-sm font-medium whitespace-nowrap text-[#2a3a42] opacity-0 shadow-sm transition-opacity duration-150 group-hover/footer:opacity-100">
            {displayName}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
