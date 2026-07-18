import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "eventhub-ui";
import {
  LayoutDashboard,
  CalendarCheck,
  MessageSquare,
  Wallet,
  Settings,
} from "lucide-react";

// Host-dashboard navigation, non-collapsible so it renders fully in the card.
export const HostDashboardNav = () => (
  <SidebarProvider>
    <Sidebar collapsible="none">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold">
            EH
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">EventHub</span>
            <span className="text-xs text-muted-foreground">Host dashboard</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive>
                <LayoutDashboard />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <CalendarCheck />
                <span>Bookings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <MessageSquare />
                <span>Messages</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Wallet />
                <span>Payouts</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
            MR
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">Marisol Rivera</span>
            <span className="text-xs text-muted-foreground">
              marisol@ivorylane.com
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  </SidebarProvider>
);
