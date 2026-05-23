import { Calendar, Home, LayoutGrid, MessageSquare, DollarSign, Star, Bell, Store, Tag, Scale, AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
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
import { useAuth0 } from "@auth0/auth0-react";
import { cn } from "@/lib/utils";
import { useResettableBadgeCount } from "@/hooks/useResettableBadgeCount";

interface VendorAccount {
 businessName: string;
 email: string;
 // Add other vendor account properties as needed
}

// Stable keys — used for routing, test IDs, and translation lookup.
// Do NOT use translated strings here.
const menuItems = [
 { key: "myHub",         url: "/vendor/shop",           icon: Store },
 { key: "dashboard",     url: "/vendor/dashboard",      icon: Home },
 { key: "bookings",      url: "/vendor/bookings",       icon: Calendar },
 { key: "listings",      url: "/vendor/listings",       icon: LayoutGrid },
 { key: "messages",      url: "/vendor/messages",       icon: MessageSquare },
 { key: "payments",      url: "/vendor/payments",       icon: DollarSign },
 { key: "discounts",     url: "/vendor/discounts",      icon: Tag },
 { key: "reviews",       url: "/vendor/reviews",        icon: Star },
 { key: "notifications", url: "/vendor/notifications",  icon: Bell },
 { key: "disputes",      url: "/vendor/disputes",       icon: Scale },
];

type VendorSidebarProps = {
 className?: string;
 showWarningBadge?: boolean;
 onWarningBadgeClick?: () => void;
};

export function VendorSidebar({ className, showWarningBadge = false, onWarningBadgeClick }: VendorSidebarProps = {}) {
 const [location] = useLocation();
 const { t } = useTranslation();
 const { isAuthenticated, isLoading: isAuthLoading, getAccessTokenSilently } = useAuth0();

 const { data: vendorAccount } = useQuery<VendorAccount>({
 queryKey: ["/api/vendor/me", isAuthenticated ? "auth" : "anon"],
 enabled: isAuthenticated && !isAuthLoading,
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
 enabled: isAuthenticated && !isAuthLoading,
 refetchInterval: (query) => (query.state.status === "error" ? false : 10000),
 staleTime: 30_000,
 });

 const unreadCount = Math.max(0, Number(unreadData?.unreadCount || 0));
 const { visibleCount: visibleUnreadCount, dismissCurrent: dismissUnreadCount } = useResettableBadgeCount({
 id: "vendor:messages",
 count: unreadCount,
 });
 useEffect(() => {
 if (!location.startsWith("/vendor/messages")) return;
 dismissUnreadCount();
 }, [dismissUnreadCount, location]);

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
 const label = t(`vendorSidebar.${item.key}`);
 return (
 <SidebarMenuItem key={item.key} className="group/menu-item relative overflow-visible">
 <SidebarMenuButton
 asChild
 isActive={location === item.url}
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
 location === item.url
 ? "bg-[#4a6a7d] text-[#f5f0e8] hover:bg-[#4a6a7d] hover:text-[#f5f0e8]"
 : "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
 )}
 >
 <Link
 href={item.url}
 className="relative isolate flex h-14 w-14 items-center justify-center overflow-visible"
 data-testid={`link-vendor-${item.key}`}
 >
 <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
 <item.icon className="!h-8 !w-8" />
 </span>
 <span className="sr-only">{label}</span>
 {item.key === "messages" && visibleUnreadCount > 0 ? (
 <span className="pointer-events-none absolute left-1/2 top-0 z-[70] min-w-[18px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#e07a6a] px-1 text-center text-[11px] font-semibold leading-4 text-[#f5f0e8]">
 {visibleUnreadCount > 99 ? "99+" : visibleUnreadCount}
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
 aria-label={showWarningBadge ? "Show policy warning" : "Vendor account"}
 >
 <Avatar className="h-11 w-11 border border-[rgba(74,106,125,0.22)]">
 <AvatarFallback className="bg-[#4a6a7d] text-[#f5f0e8] text-sm">
 {vendorAccount?.businessName?.[0]?.toUpperCase() || "V"}
 </AvatarFallback>
 </Avatar>
 {showWarningBadge ? (
 <span className="pointer-events-none absolute -right-1 -top-1 z-[70] flex h-5 w-5 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700">
 <AlertTriangle className="h-3 w-3" />
 </span>
 ) : null}
 </button>
 <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 rounded-md border border-[rgba(74,106,125,0.22)] bg-[#ffffff] px-2.5 py-1 text-sm font-medium whitespace-nowrap text-[#2a3a42] opacity-0 shadow-sm transition-opacity duration-150 group-hover/footer:opacity-100">
 {vendorAccount?.businessName || "Vendor"}
 </span>
 </div>
 </SidebarFooter>
 </Sidebar>
 );
}
