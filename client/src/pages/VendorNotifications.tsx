import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function VendorNotifications() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <VendorSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div>
                <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
                  Notifications
                </h1>
                <p className="text-muted-foreground">
                  Manage your notification preferences and alerts
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Notifications</CardTitle>
                  <CardDescription>
                    Your latest alerts and updates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No notifications</h3>
                    <p className="text-muted-foreground">
                      You're all caught up! Notifications will appear here.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>
                    Choose what alerts you want to receive
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="new-bookings">New Bookings</Label>
                      <p className="text-sm text-muted-foreground">Get notified when customers book your services</p>
                    </div>
                    <Switch id="new-bookings" defaultChecked data-testid="switch-new-bookings" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="new-messages">New Messages</Label>
                      <p className="text-sm text-muted-foreground">Alert when you receive customer messages</p>
                    </div>
                    <Switch id="new-messages" defaultChecked data-testid="switch-new-messages" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="reschedules">Reschedule Requests</Label>
                      <p className="text-sm text-muted-foreground">When customers request to change event dates</p>
                    </div>
                    <Switch id="reschedules" defaultChecked data-testid="switch-reschedules" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="cancellations">Cancellations</Label>
                      <p className="text-sm text-muted-foreground">Alert when bookings are cancelled</p>
                    </div>
                    <Switch id="cancellations" defaultChecked data-testid="switch-cancellations" />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="payments">Payment Updates</Label>
                      <p className="text-sm text-muted-foreground">Notifications about payment receipts and payouts</p>
                    </div>
                    <Switch id="payments" defaultChecked data-testid="switch-payments" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
