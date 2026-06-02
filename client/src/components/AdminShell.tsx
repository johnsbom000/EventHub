import React, { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import BrandWordmark from "@/components/BrandWordmark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  ArrowLeft, Menu,
  LayoutDashboard, TrendingUp, Calendar, AlertTriangle,
  ArrowRightLeft, Users, LayoutGrid, Eye, Shield, Star,
  MessageSquarePlus, Activity, LogOut,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { cn } from "@/lib/utils";

const adminMobileNavItems = [
  { title: "Overview",    url: "/admin",            icon: LayoutDashboard },
  { title: "Revenue",     url: "/admin/revenue",    icon: TrendingUp },
  { title: "Bookings",    url: "/admin/bookings",   icon: Calendar },
  { title: "Disputes",    url: "/admin/disputes",   icon: AlertTriangle },
  { title: "Payouts",     url: "/admin/payouts",    icon: ArrowRightLeft },
  { title: "Users",       url: "/admin/users",      icon: Users },
  { title: "Listings",    url: "/admin/listings",   icon: LayoutGrid },
  { title: "Traffic",     url: "/admin/traffic",    icon: Eye },
  { title: "Moderation",  url: "/admin/moderation", icon: Shield },
  { title: "Marquee",     url: "/admin/marquee",    icon: Star },
  { title: "Feedback",    url: "/admin/feedback",   icon: MessageSquarePlus },
  { title: "Health",      url: "/admin/health",     icon: Activity },
];

type AdminShellProps = {
  children: React.ReactNode;
};

const sidebarStyle = {
  "--sidebar-width": "6rem",
  "--sidebar-width-icon": "6rem",
} as React.CSSProperties;

export default function AdminShell({ children }: AdminShellProps) {
  const [location, setLocation] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { logout } = useAuth0();

  const isActive = (url: string) =>
    url === "/admin" ? location === "/admin" : location.startsWith(url);

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="swap-dashboard-whites flex h-screen w-full flex-col">

        {/* Header */}
        <header className="flex items-center justify-between border-b border-[rgba(30,45,58,0.18)] bg-white px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md text-[#2a3a42] hover:bg-[#e6e1d6] transition-colors"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/admin" className="flex items-center gap-2 rounded-md px-2 py-1">
              <BrandWordmark
                className="text-[1.6rem]"
                eventClassName="text-[#e07a6a] font-normal"
                hubClassName="text-[#1e2d3a] font-normal"
              />
              <span className="ml-2 rounded bg-[#1e2d3a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                Admin
              </span>
            </Link>
          </div>

          <Button
            variant="default"
            className="no-global-scale editorial-login-btn min-h-0 h-[27px] min-w-[136px] rounded-[7px] px-3.5 py-0 text-[12.5px] leading-none gap-1 [&_svg]:!size-2"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft />
            Back to Site
          </Button>
        </header>

        {/* Mobile nav drawer */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-64 p-0 flex flex-col">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="px-4 py-4 border-b border-[rgba(30,45,58,0.18)]">
              <BrandWordmark
                className="text-[1.4rem]"
                eventClassName="text-[#e07a6a] font-normal"
                hubClassName="text-[#1e2d3a] font-normal"
              />
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
              {adminMobileNavItems.map((item) => (
                <Link
                  key={item.url}
                  href={item.url}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                    isActive(item.url)
                      ? "bg-[#1e2d3a] text-white"
                      : "text-[#2a3a42] hover:bg-[#e6e1d6]"
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span>{item.title}</span>
                </Link>
              ))}
            </nav>
            <div className="px-3 pb-4 pt-2 border-t border-[rgba(30,45,58,0.18)]">
              <button
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#2a3a42] hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          <AdminSidebar className="hidden lg:flex shrink-0" />
          <main className="flex-1 overflow-auto p-6 pb-6">
            {children}
          </main>
        </div>

      </div>
    </SidebarProvider>
  );
}
