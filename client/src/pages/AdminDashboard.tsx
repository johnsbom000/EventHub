import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboard() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1 bg-background py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold mb-8" data-testid="text-page-title">
            Admin Dashboard
          </h1>

          <Tabs defaultValue="vendors" className="space-y-4">
            <TabsList>
              <TabsTrigger value="vendors" data-testid="tab-vendors">Vendors</TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
              <TabsTrigger value="bookings" data-testid="tab-bookings">Bookings</TabsTrigger>
            </TabsList>

            <TabsContent value="vendors">
              <Card>
                <CardHeader>
                  <CardTitle>Vendor Applications</CardTitle>
                  <CardDescription>Review and approve vendor submissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[1, 2].map((item) => (
                      <div key={item} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`vendor-item-${item}`}>
                        <div className="flex-1">
                          <p className="font-medium">Sample Vendor {item}</p>
                          <p className="text-sm text-muted-foreground">Category: Venues</p>
                        </div>
                        <Badge variant="secondary">Submitted</Badge>
                        <div className="flex gap-2 ml-4">
                          <Button size="sm" data-testid={`button-approve-${item}`}>Approve</Button>
                          <Button size="sm" variant="outline" data-testid={`button-reject-${item}`}>Reject</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>View and manage all users</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center py-8">
                    User management will be implemented in the next phase
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bookings">
              <Card>
                <CardHeader>
                  <CardTitle>All Bookings</CardTitle>
                  <CardDescription>Monitor booking activity</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Booking management will be implemented in the next phase
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
}
