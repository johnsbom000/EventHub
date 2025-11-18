import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MessageSquare, Bell, Settings, User, Home as HomeIcon } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export default function CustomerDashboard() {
  const [, setLocation] = useLocation();

  // Fetch current customer
  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customer/me"],
    retry: false,
  });

  useEffect(() => {
    // Redirect to login if not authenticated
    const token = localStorage.getItem("customerToken");
    if (!token && !isLoading) {
      setLocation("/login");
    }
  }, [isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {customer.name}!</h1>
          <p className="text-muted-foreground">Manage your events and bookings</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/planner")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">My Events</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Active events
              </p>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Unread messages
              </p>
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bookings</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Active bookings
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest interactions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No recent activity
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Get started planning your event</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                onClick={() => setLocation("/planner")}
                className="w-full text-left p-3 rounded-lg hover-elevate border flex items-center gap-3"
                data-testid="button-plan-event"
              >
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Plan New Event</p>
                  <p className="text-sm text-muted-foreground">Start planning your event</p>
                </div>
              </button>
              
              <button
                onClick={() => setLocation("/browse")}
                className="w-full text-left p-3 rounded-lg hover-elevate border flex items-center gap-3"
                data-testid="button-browse-vendors"
              >
                <HomeIcon className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Browse Vendors</p>
                  <p className="text-sm text-muted-foreground">Find services for your event</p>
                </div>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
