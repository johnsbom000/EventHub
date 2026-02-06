import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

type VendorNotification = {
  id: string;
  title: string | null;
  message: string | null;
  link: string | null;
  read: boolean | null;
  createdAt: string | null;
  type?: string | null;
};

export default function VendorNotifications() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const { isAuthenticated } = useAuth0();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery<VendorNotification[]>({
    queryKey: ["/api/vendor/notifications"],
    enabled: isAuthenticated,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/vendor/notifications/${id}/read`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error(`mark read failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/vendor/notifications"] });
    },
  });

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
                  {isLoading ? (
                    <div className="text-center py-12 text-muted-foreground">Loading...</div>
                  ) : notifications.length === 0 ? (
                    <div className="text-center py-12">
                      <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No notifications</h3>
                      <p className="text-muted-foreground">
                        You're all caught up! Notifications will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((n) => {
                        const created = n.createdAt ? new Date(n.createdAt) : null;
                        const timeLabel = created
                          ? created.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                          : "";

                        const isUnread = n.read === false || n.read === null;

                        return (
                          <button
                            key={n.id}
                            type="button"
                            className={`w-full text-left rounded-lg border p-4 hover:bg-muted/50 transition ${
                              isUnread ? "bg-muted/30" : "bg-background"
                            }`}
                            onClick={async () => {
                              if (isUnread && !markRead.isPending) {
                                await markRead.mutateAsync(n.id);
                              }
                              if (n.link) setLocation(n.link);
                            }}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className={`h-2 w-2 rounded-full ${isUnread ? "bg-primary" : "bg-transparent"}`} />
                                  <div className="font-medium truncate">{n.title || "Notification"}</div>
                                </div>
                                {n.message ? (
                                  <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{n.message}</div>
                                ) : null}
                              </div>

                              <div className="shrink-0 text-xs text-muted-foreground">{timeLabel}</div>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                              {isUnread ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!markRead.isPending) await markRead.mutateAsync(n.id);
                                  }}
                                >
                                  Mark as read
                                </Button>
                              ) : null}

                              {n.link ? (
                                <span className="text-xs text-muted-foreground">Click to open</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">No link</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
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
