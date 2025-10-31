import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, MessageSquare, XCircle, CheckCircle } from "lucide-react";

export default function VendorBookings() {
  const { data: bookings = [] } = useQuery({
    queryKey: ["/api/vendor/bookings"],
  });

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
                  Bookings & Jobs
                </h1>
                <p className="text-muted-foreground">
                  Manage your event bookings and customer requests
                </p>
              </div>

              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                  <TabsTrigger value="upcoming" data-testid="tab-upcoming">Upcoming</TabsTrigger>
                  <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
                  <TabsTrigger value="completed" data-testid="tab-completed">Completed</TabsTrigger>
                  <TabsTrigger value="cancelled" data-testid="tab-cancelled">Cancelled</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>All Bookings</CardTitle>
                      <CardDescription>Complete list of all your bookings</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {bookings.length === 0 ? (
                        <div className="text-center py-12">
                          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                          <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
                          <p className="text-muted-foreground">
                            Your bookings will appear here once customers start booking your services.
                          </p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Customer</TableHead>
                              <TableHead>Event Date</TableHead>
                              <TableHead>Service</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* Bookings will be rendered here */}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
