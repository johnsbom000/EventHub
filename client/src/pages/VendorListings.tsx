import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CreateListingWizard } from "@/features/vendor/create-listing/CreateListingWizard";

export default function VendorListings() {
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <>
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <VendorSidebar />
          <div className="flex flex-col flex-1">
            <header className="flex items-center justify-between p-4 border-b">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <Button 
                onClick={() => setShowCreateWizard(true)}
                data-testid="button-create-listing"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Listing
              </Button>
            </header>
            <main className="flex-1 overflow-auto p-6">
              <div className="max-w-7xl mx-auto space-y-6">
                <div>
                  <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
                    Listings Management
                  </h1>
                  <p className="text-muted-foreground">
                    Create and manage your service listings, packages, and pricing
                  </p>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Your Listings</CardTitle>
                    <CardDescription>
                      Manage your service offerings and make them available to customers
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <Plus className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No listings yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Create your first service listing to start attracting customers.
                      </p>
                      <Button 
                        onClick={() => setShowCreateWizard(true)}
                        data-testid="button-create-first-listing"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Your First Listing
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>

      {showCreateWizard && (
        <CreateListingWizard onClose={() => setShowCreateWizard(false)} />
      )}
    </>
  );
}
