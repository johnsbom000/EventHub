import { Bell, Calendar, MessageSquare, PlusCircle, User, Scale, AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";

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
import { cn } from "@/lib/utils";
import { useResettableBadgeCount } from "@/hooks/useResettableBadgeCount";

interface CustomerMe {
 id: string;
 name: string;
 displayName?: string | null;
 email: string;
}

// Stable keys — used for routing, test IDs, and translation lookup.
const menuItems = [
 { key: "myEvents",       url: "/dashboard/events",        icon: Calendar },
 { key: "messages",       url: "/dashboard/messages",       icon: MessageSquare },
 { key: "notifications",  url: "/dashboard/notifications",  icon: Bell },
 { key: "planNewEvent",   url: "/dashboard/plan",           icon: PlusCircle },
 { key: "disputes",       url: "/dashboard/disputes",       icon: Scale },
 { key: "myProfile",      url: "/dashboard/profile",        icon: User },
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

type CustomerSidebarProps = {
 className?: string;
 showWarningBadge?: boolean;
 onWarningBadgeClick?: () => void;
};

export function CustomerSidebar({ className, showWarningBadge = false, onWarningBadgeClick }: CustomerSidebarProps = {}) {
 const [location] = useLocation();
 const { t } = useTranslation();
 const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();

 const { data: customer } = useQuery<CustomerMe>({
 queryKey: ["/api/customer/me"],
 enabled: isAuthenticated && !isAuthLoading,
 retry: false,
 });

 const { data: unreadData } = useQuery<{ unreadCount: number }>({
 queryKey: ["/api/customer/messages/unread-count"],
 enabled: isAuthenticated && !isAuthLoading,
 refetchInterval: (query) => (query.state.status === "error" ? false : 10000),
 staleTime: 30_000,
 });

 const unreadCount = Math.max(0, Number(unreadData?.unreadCount || 0));
 const { visibleCount: visibleUnreadCount, dismissCurrent: dismissUnreadCount } = useResettableBadgeCount({
 id: "customer:messages",
 count: unreadCount,
 });
 useEffect(() => {
 if (!location.startsWith("/dashboard/messages")) return;
 dismissUnreadCount();
 }, [dismissUnreadCount, location]);

 const { data: notifData } = useQuery<{ unreadCount: number }>({
 queryKey: ["/api/customer/notifications/unread-count"],
 enabled: isAuthenticated && !isAuthLoading,
 refetchInterval: (query) => (query.state.status === "error" ? false : 30000),
 staleTime: 30_000,
 });
 const notifUnreadCount = Math.max(0, Number(notifData?.unreadCount || 0));
 const { visibleCount: visibleNotifCount, dismissCurrent: dismissNotifCount } = useResettableBadgeCount({
 id: "customer:notifications",
 count: notifUnreadCount,
 });
 useEffect(() => {
 if (!location.startsWith("/dashboard/notifications")) return;
 dismissNotifCount();
 }, [dismissNotifCount, location]);
 const displayName = customer?.displayName?.trim() || customer?.name || "Customer";

 return (
 <Sidebar
 collapsible="none"
 className={cn(
 "relative z-20 border-r border-[rgba(74,106,125,0.22)] bg-[#ffffff] ",
 className
 )}
 >
 <SidebarContent className="items-center overflow-y-auto overflow-x-visible px-0 pt-6">
 <SidebarGroup className="px-0">
 <SidebarGroupContent>
 <SidebarMenu className="items-center gap-3">
 {menuItems.map((item) => {
 const label = t(`customerSidebar.${item.key}`);
 return (
 <SidebarMenuItem key={item.key} className="group/menu-item relative overflow-visible">
 <SidebarMenuButton
 asChild
 isActive={isMenuItemActive(location, item.url)}
 tooltip={{
 children: label,
 hidden: false,
 side: "right",
 align: "center",
 className:
 "border border-[rgba(74,106,125,0.22)] bg-[#ffffff] text-[#2a3a42]",
 }}
 className={cn(
 "h-14 w-14 justify-center overflow-visible rounded-2xl p-0",
 isMenuItemActive(location, item.url)
 ? "bg-[#4a6a7d] text-[#f5f0e8] hover:bg-[#4a6a7d] hover:text-[#f5f0e8]"
 : "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
 )}
 >
 <Link
 href={item.url}
 className="relative isolate flex h-14 w-14 items-center justify-center overflow-visible"
 data-testid={`link-customer-${item.key}`}
 >
 <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
 <item.icon className="!h-8 !w-8" />
 </span>
 <span className="sr-only">{label}</span>
 {item.key === "messages" && visibleUnreadCount > 0 ? (
 <span className="pointer-events-none absolute left-1/2 top-0 z-[70] flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full bg-[hsl(var(--secondary-accent))] px-1 text-[10px] font-semibold text-[hsl(var(--secondary-accent-foreground))]">
 {visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}
 </span>
 ) : null}
 {item.key === "notifications" && visibleNotifCount > 0 ? (
 <span className="pointer-events-none absolute left-1/2 top-0 z-[70] flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/3 items-center justify-center rounded-full bg-[hsl(var(--secondary-accent))] px-1 text-[10px] font-semibold text-[hsl(var(--secondary-accent-foreground))]">
 {visibleNotifCount > 99 ? "99+" : visibleNotifCount}
 </span>
 ) : null}
 </Link>
 </SidebarMenuButton>
 </SidebarMenuItem>
 );
 })}
 </SidebarMenu>
 </SidebarGroupContent>
 </SidebarGroup>
 </SidebarContent>
 <SidebarFooter className="mt-auto px-2 pb-4 pt-2">
 <div className="group/footer relative mx-auto overflow-visible">
 <button
 type="button"
 onClick={() => onWarningBadgeClick?.()}
 className={cn(
 "relative rounded-full",
 onWarningBadgeClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4a6a7d]/50" : "cursor-default"
 )}
 aria-label={showWarningBadge ? "Show policy warning" : "Customer account"}
 >
 <Avatar className="h-11 w-11 border border-[rgba(74,106,125,0.22)]">
 <AvatarFallback className="bg-[#4a6a7d] text-[#f5f0e8] text-sm">
 {getInitials(displayName)}
 </AvatarFallback>
 </Avatar>
 {showWarningBadge ? (
 <span className="pointer-events-none absolute -right-1 -top-1 z-[70] flex h-5 w-5 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700">
 <AlertTriangle className="h-3 w-3" />
 </span>
 ) : null}
 </button>
 <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 rounded-md border border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2.5 py-1 text-sm font-medium whitespace-nowrap text-[#2a3a42] opacity-0 shadow-sm transition-opacity duration-150 group-hover/footer:opacity-100">
 {displayName}
 </span>
 </div>
 </SidebarFooter>
 </Sidebar>
 );
}
