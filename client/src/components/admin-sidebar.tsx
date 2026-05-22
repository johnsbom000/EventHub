import {
  LayoutDashboard, TrendingUp, Calendar, AlertTriangle,
  ArrowRightLeft, Users, LayoutGrid, Eye, Shield, LogOut, MessageSquarePlus, Activity,
} from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth0 } from "@auth0/auth0-react";
import { cn } from "@/lib/utils";
import { useResettableBadgeCount } from "@/hooks/useResettableBadgeCount";

const menuItems = [
  { title: "Overview",    url: "/admin",            icon: LayoutDashboard },
  { title: "Revenue",     url: "/admin/revenue",    icon: TrendingUp },
  { title: "Bookings",    url: "/admin/bookings",   icon: Calendar },
  { title: "Disputes",    url: "/admin/disputes",   icon: AlertTriangle },
  { title: "Payouts",     url: "/admin/payouts",    icon: ArrowRightLeft },
  { title: "Users",       url: "/admin/users",      icon: Users },
  { title: "Listings",    url: "/admin/listings",   icon: LayoutGrid },
  { title: "Traffic",     url: "/admin/traffic",    icon: Eye },
  { title: "Moderation",  url: "/admin/moderation", icon: Shield },
  { title: "Feedback",    url: "/admin/feedback",   icon: MessageSquarePlus },
  { title: "Health",      url: "/admin/health",     icon: Activity },
];

export function AdminSidebar({ className }: { className?: string }) {
  const [location] = useLocation();
  const { logout } = useAuth0();

  // Live open-dispute count for the badge
  const { data: disputes = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/disputes"],
    staleTime: 60_000,
  });
  const openDisputes = disputes.filter(
    (d: any) => d.status !== "resolved_refund" && d.status !== "resolved_payout"
  ).length;

  // Live health alert count for the badge
  const { data: healthData } = useQuery<any>({
    queryKey: ["/api/admin/health"],
    staleTime: 5 * 60_000, // re-check every 5 min
    refetchInterval: 5 * 60_000,
  });
  const healthAlerts: number = healthData?.summary?.totalAlerts ?? 0;
  const { visibleCount: visibleDisputesCount, dismissCurrent: dismissDisputesBadge } = useResettableBadgeCount({
    id: "admin:disputes",
    count: openDisputes,
  });
  const { visibleCount: visibleHealthCount, dismissCurrent: dismissHealthBadge } = useResettableBadgeCount({
    id: "admin:health",
    count: healthAlerts,
  });
  useEffect(() => {
    if (location.startsWith("/admin/disputes")) dismissDisputesBadge();
    if (location.startsWith("/admin/health")) dismissHealthBadge();
  }, [dismissDisputesBadge, dismissHealthBadge, location]);

  const isActive = (url: string) =>
    url === "/admin" ? location === "/admin" : location.startsWith(url);

  return (
    <Sidebar
      collapsible="none"
      className={cn(
        "relative z-20 border-r border-[rgba(30,45,58,0.18)] bg-[#ffffff]",
        className
      )}
    >
      <SidebarContent className="items-center overflow-y-auto overflow-x-visible px-0 pt-6">
        <SidebarGroup className="px-0">
          <SidebarGroupContent>
            <SidebarMenu className="items-center gap-3">
              {menuItems.map((item) => {
                const active = isActive(item.url);
                const badge =
                  item.title === "Disputes" && visibleDisputesCount > 0 ? visibleDisputesCount :
                  item.title === "Health"   && visibleHealthCount > 0 ? visibleHealthCount :
                  null;
                return (
                  <SidebarMenuItem key={item.title} className="group/menu-item relative overflow-visible">
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={{
                        children: item.title,
                        hidden: false,
                        side: "right",
                        align: "center",
                        className: "border border-[rgba(30,45,58,0.18)] bg-white text-[#1e2d3a]",
                      }}
                      className={cn(
                        "h-14 w-14 justify-center overflow-visible rounded-2xl p-0",
                        active
                          ? "bg-[#1e2d3a] text-white hover:bg-[#1e2d3a] hover:text-white"
                          : "text-[#2a3a42] hover:bg-[#e6e1d6] hover:text-[#2a3a42]"
                      )}
                    >
                      <Link
                        href={item.url}
                        className="relative flex h-14 w-14 items-center justify-center overflow-visible"
                      >
                        <item.icon className="!h-6 !w-6" />
                        <span className="sr-only">{item.title}</span>
                        {badge ? (
                          <span className="pointer-events-none absolute left-1/2 top-0 z-[70] min-w-[18px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#e07a6a] px-1 text-center text-[11px] font-semibold leading-4 text-white">
                            {badge > 99 ? "99+" : badge}
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
        {/* Logout button */}
        <button
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          className="group/footer relative mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(30,45,58,0.18)] text-[#2a3a42] hover:bg-red-50 hover:text-red-600 transition-colors"
          title="Sign out"
        >
          <LogOut className="h-5 w-5" />
          <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 rounded-md border border-[rgba(30,45,58,0.18)] bg-white px-2.5 py-1 text-sm font-medium whitespace-nowrap text-[#1e2d3a] opacity-0 shadow-sm transition-opacity duration-150 group-hover/footer:opacity-100">
            Sign out
          </span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
