import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Briefcase } from "lucide-react";

export default function RoleSelection() {
  const [, setLocation] = useLocation();

  const handleRoleSelection = (role: "customer" | "vendor") => {
    if (role === "customer") {
      // Navigate to Customer Profile Questions
      setLocation("/profile-questions");
    } else {
      // Navigate to Vendor Onboarding Wizard
      setLocation("/vendor/onboarding");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl" data-testid="card-role-selection">
        <CardHeader className="text-center">
          <CardTitle className="font-serif text-3xl mb-2">Welcome to Event Hub!</CardTitle>
          <CardDescription className="text-base">
            Set up your account to get to know you
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-center text-muted-foreground mb-6">
            Do you want to:
          </p>

          <div className="grid gap-4">
            {/* Plan An Event - Customer */}
            <Button
              variant="outline"
              size="lg"
              className="h-auto py-6 flex flex-col items-center gap-3 hover-elevate"
              onClick={() => handleRoleSelection("customer")}
              data-testid="button-plan-event"
            >
              <Calendar className="h-12 w-12 text-primary" />
              <div className="text-center">
                <div className="text-xl font-semibold mb-1">Plan An Event</div>
                <div className="text-sm text-muted-foreground">
                  Find and book vendors for your special occasions
                </div>
              </div>
            </Button>

            {/* Become A Vendor */}
            <Button
              variant="outline"
              size="lg"
              className="h-auto py-6 flex flex-col items-center gap-3 hover-elevate"
              onClick={() => handleRoleSelection("vendor")}
              data-testid="button-become-vendor"
            >
              <Briefcase className="h-12 w-12 text-primary" />
              <div className="text-center">
                <div className="text-xl font-semibold mb-1">Become A Vendor</div>
                <div className="text-sm text-muted-foreground">
                  Offer your services and grow your business
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
