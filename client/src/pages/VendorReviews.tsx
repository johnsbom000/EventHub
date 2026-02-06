import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";

type VendorReviewItem = {
  id: string;
  rating?: number | null;
  createdAt?: string | null;
};

export default function VendorReviews() {
  const { isAuthenticated } = useAuth0();

  const { data: reviews = [] } = useQuery<VendorReviewItem[]>({
    queryKey: ["/api/vendor/reviews"],
    enabled: isAuthenticated,
  });

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
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
                  Reviews
                </h1>
                <p className="text-muted-foreground">View and respond to customer reviews</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                    <Star className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-avg-rating">
                      0.0
                    </div>
                    <p className="text-xs text-muted-foreground">Out of 5.0</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
                    <Star className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-total-reviews">
                      0
                    </div>
                    <p className="text-xs text-muted-foreground">All time</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
                    <Star className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-response-rate">
                      0%
                    </div>
                    <p className="text-xs text-muted-foreground">Replied to reviews</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Customer Reviews</CardTitle>
                  <CardDescription>Read and reply to customer feedback</CardDescription>
                </CardHeader>
                <CardContent>
                  {reviews.length === 0 ? (
                    <div className="text-center py-12">
                      <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
                      <p className="text-muted-foreground">
                        Customer reviews will appear here after completed events.
                      </p>
                    </div>
                  ) : (
                    <div>{/* Reviews list will be rendered here later */}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}