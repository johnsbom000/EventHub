import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Users, Building2, Calendar, DollarSign, TrendingUp, Eye, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";

interface UserGrowthData {
  date: string;
  count: number;
}

interface VendorByTypeData {
  serviceType: string;
  count: number;
}

interface UserStats {
  totalUsers: number;
  totalVendors: number;
  userGrowth: UserGrowthData[];
  vendorsByType: VendorByTypeData[];
}

interface BookingStats {
  totalBookings: number;
  completedBookings: number;
  totalRevenue: number;
  platformFeeTotal?: number;
  customerFeeTotal?: number;
  totalFeeEarnings?: number;
}

interface TrafficStats {
  totalVisits: number;
  uniqueVisitors: number;
  dailyTraffic: Array<{
    date: string;
    count: number;
  }>;
  topPaths: Array<{
    path: string;
    visits: number;
  }>;
}

interface ListingStats {
  totalListings: number;
  activeListings: number;
  inactiveListings: number;
  // Add other properties that your listing stats might have
}

interface ChatFlagRow {
  actorType: "customer" | "vendor";
  actorId: string;
  displayName: string;
  email: string | null;
  flagCount: number;
  lastFlaggedAt: string | null;
  latestReason: string | null;
  latestSampleText: string | null;
}

import { useEffect } from "react";

interface User {
  role: string;
  // Add other user properties here if needed
  [key: string]: any; // For any additional properties that might exist
}

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
}

function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[20px]">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth0();

  // Verify user is admin by checking their role from /api/customer/me
  const { data: currentUser, isLoading: loadingUser } = useQuery<User>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated,
  });

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/");
      return;
    }

    // Wait for user data to load
    if (!loadingUser && currentUser) {
      if (currentUser.role !== "admin") {
        setLocation("/dashboard");
      }
    }
  }, [setLocation, currentUser, loadingUser, isAuthenticated]);

  const { data: userStats } = useQuery<UserStats>({
    queryKey: ["/api/admin/stats/users"],
    enabled: isAuthenticated && currentUser?.role === "admin",
  });

  const { data: listingStats } = useQuery<ListingStats>({
    queryKey: ["/api/admin/stats/listings"],
    enabled: isAuthenticated && currentUser?.role === "admin",
  });

  const { data: bookingStats } = useQuery<BookingStats>({
    queryKey: ["/api/admin/stats/bookings"],
    enabled: isAuthenticated && currentUser?.role === "admin",
  });

  const { data: trafficStats } = useQuery<TrafficStats>({
    queryKey: ["/api/admin/stats/traffic"],
    enabled: isAuthenticated && currentUser?.role === "admin",
  });

  const { data: chatFlags = [] } = useQuery<ChatFlagRow[]>({
    queryKey: ["/api/admin/stats/chat-flags"],
    enabled: isAuthenticated && currentUser?.role === "admin",
  });

  // Show loading while verifying admin status
  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Don't render if not admin (will redirect)
  // @ts-ignore
  if (!currentUser) return <div className="p-8">Please log in.</div>;
  if (currentUser.role !== "admin") return <div className="p-8">Not authorized.</div>;


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-serif font-bold mb-2" data-testid="heading-admin-dashboard">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Event Hub marketplace analytics and insights
          </p>
        </div>

        {/* Top Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
          <StatsCard
            title="Total Users"
            value={userStats?.totalUsers || 0}
            description="Registered customers"
            icon={<Users className="h-4 w-4 text-muted-foreground" data-testid="icon-users" />}
          />
          <StatsCard
            title="Total Vendors"
            value={userStats?.totalVendors || 0}
            description="Active service providers"
            icon={<Building2 className="h-4 w-4 text-muted-foreground" data-testid="icon-vendors" />}
          />
          <StatsCard
            title="Total Bookings"
            value={bookingStats?.totalBookings || 0}
            description={`${bookingStats?.completedBookings || 0} completed`}
            icon={<Calendar className="h-4 w-4 text-muted-foreground" data-testid="icon-bookings" />}
          />
          <StatsCard
            title="Total Revenue"
            value={formatCurrency(Number(bookingStats?.totalRevenue) || 0)}
            description="Gross booking value"
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" data-testid="icon-revenue" />}
          />
          <StatsCard
            title="Fee Earnings"
            value={formatCurrency(Number(bookingStats?.totalFeeEarnings) || 0)}
            description={`Vendor fee: ${formatCurrency(Number(bookingStats?.platformFeeTotal) || 0)} | Customer fee: ${formatCurrency(Number(bookingStats?.customerFeeTotal) || 0)}`}
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" data-testid="icon-fee-earnings" />}
          />
          <StatsCard
            title="Flagged Accounts"
            value={chatFlags.length}
            description="Chat moderation alerts"
            icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" data-testid="icon-chat-flags" />}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {/* User Growth Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                User Growth (Last 30 Days)
              </CardTitle>
              <CardDescription>Daily new user registrations</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={userStats?.userGrowth || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Vendors by Type */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Vendors by Service Type
              </CardTitle>
              <CardDescription>Distribution of vendor categories</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={userStats?.vendorsByType || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="serviceType" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Flagged Chat Accounts
            </CardTitle>
            <CardDescription>
              Accounts flagged for profanity/toxic chat content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chatFlags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No flagged accounts yet.</p>
            ) : (
              <div className="space-y-3">
                {chatFlags.map((row) => (
                  <div
                    key={`${row.actorType}-${row.actorId}`}
                    className="rounded-lg border p-3"
                    data-testid={`chat-flag-${row.actorType}-${row.actorId}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {row.displayName}{" "}
                        <span className="text-xs uppercase text-muted-foreground">({row.actorType})</span>
                      </p>
                      <p className="text-sm font-semibold">{row.flagCount} flags</p>
                    </div>
                    {row.email ? (
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last flagged:{" "}
                      {row.lastFlaggedAt
                        ? new Date(row.lastFlaggedAt).toLocaleString()
                        : "unknown"}
                    </p>
                    {row.latestReason ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Latest reason: {row.latestReason}
                      </p>
                    ) : null}
                    {row.latestSampleText ? (
                      <p className="mt-2 rounded bg-muted px-2 py-1 text-xs">
                        {row.latestSampleText}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts Row 2 */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {/* Traffic Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Website Traffic (Last 30 Days)
              </CardTitle>
              <CardDescription>
                {trafficStats?.totalVisits || 0} total visits | {trafficStats?.uniqueVisitors || 0} unique visitors
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trafficStats?.dailyTraffic || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Pages */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" />
                Most Visited Pages
              </CardTitle>
              <CardDescription>Top 10 pages by traffic</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trafficStats?.topPaths?.slice(0, 10).map((item: any, index: number) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate flex-1" data-testid={`path-${index}`}>
                      {item.path}
                    </span>
                    <span className="text-sm text-muted-foreground ml-4" data-testid={`count-${index}`}>
                      {item.count} visits
                    </span>
                  </div>
                ))}
                {(!trafficStats?.topPaths || trafficStats.topPaths.length === 0) && (
                  <p className="text-sm text-muted-foreground">No traffic data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Listings Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Total Listings</CardTitle>
              <CardDescription>All vendor listings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold" data-testid="text-total-listings">
                {listingStats?.totalListings || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Listings</CardTitle>
              <CardDescription>Currently published</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary" data-testid="text-active-listings">
                {listingStats?.activeListings || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inactive Listings</CardTitle>
              <CardDescription>Drafts or unpublished</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-muted-foreground" data-testid="text-inactive-listings">
                {listingStats?.inactiveListings || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
