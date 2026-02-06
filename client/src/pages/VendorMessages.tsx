import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { VendorSidebar } from "@/components/vendor-sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";

type VendorMessage = {
  id: string;
  // minimal shape so TypeScript knows it's an array
};

export default function VendorMessages() {
  const { isAuthenticated } = useAuth0();

  const { data: messages = [] } = useQuery<VendorMessage[]>({
    queryKey: ["/api/vendor/messages"],
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
                  Messages
                </h1>
                <p className="text-muted-foreground">
                  Messaging is currently disabled. Please contact customers via email for now.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Inbox</CardTitle>
                  <CardDescription>Conversations will reappear here when messaging is re-enabled.</CardDescription>
                </CardHeader>
                <CardContent>
                  {messages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Messaging is disabled</h3>
                      <p className="text-muted-foreground">
                        For now, use email to communicate with customers.
                      </p>
                    </div>
                  ) : (
                    <div>{/* If you ever re-enable messaging, render threads here */}</div>
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
