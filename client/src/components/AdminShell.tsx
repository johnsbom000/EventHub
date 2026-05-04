import React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import BrandWordmark from "@/components/BrandWordmark";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";

type AdminShellProps = {
  children: React.ReactNode;
};

const sidebarStyle = {
  "--sidebar-width": "6rem",
  "--sidebar-width-icon": "6rem",
} as React.CSSProperties;

export default function AdminShell({ children }: AdminShellProps) {
  const [, setLocation] = useLocation();

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="swap-dashboard-whites flex h-screen w-full flex-col">

        {/* Header */}
        <header className="flex items-center justify-between border-b border-[rgba(30,45,58,0.18)] bg-white px-4 py-3 shrink-0">
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

          <Button
            variant="default"
            className="no-global-scale editorial-login-btn min-h-0 h-[27px] min-w-[136px] rounded-[7px] px-3.5 py-0 text-[12.5px] leading-none gap-1 [&_svg]:!size-2"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft />
            Back to Site
          </Button>
        </header>

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
