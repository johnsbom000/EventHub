import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

export default function VendorOnboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [accountType, setAccountType] = useState<"express" | "standard">("express");
  const [businessName, setBusinessName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Check if vendor account exists and has stripe connected
  const { data: vendorAccount, isLoading } = useQuery({
    queryKey: ["/api/vendor/me"],
    retry: false,
  });

  // Populate business name from vendor account when data loads
  useEffect(() => {
    console.log("VendorOnboarding: vendor account data:", vendorAccount);
    if (vendorAccount?.businessName) {
      console.log("VendorOnboarding: setting business name to:", vendorAccount.businessName);
      setBusinessName(vendorAccount.businessName);
    } else {
      console.log("VendorOnboarding: no business name found in vendor account");
    }
  }, [vendorAccount]);

  async function handleCreateAccount() {
    if (!businessName.trim()) {
      toast({
        variant: "destructive",
        title: "Missing information",
        description: "Please enter your business name",
      });
      return;
    }

    setIsCreating(true);
    try {
      const token = localStorage.getItem("vendorToken");
      const response = await fetch("/api/vendor/connect/onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          accountType,
          businessName,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create Stripe account");
      }

      const { onboardingUrl } = await response.json();

      toast({
        title: "Redirecting to Stripe",
        description: "Please complete your payment setup",
      });

      // Redirect to Stripe onboarding
      if (onboardingUrl) {
        window.location.href = onboardingUrl;
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Setup failed",
        description: error.message || "Could not create Stripe account",
      });
    } finally {
      setIsCreating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (vendorAccount?.stripeOnboardingComplete) {
    // Already onboarded, redirect to dashboard
    setLocation("/vendor/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Set Up Payment Processing</CardTitle>
          <CardDescription>
            Connect your Stripe account to receive payments from customers. Event Hub takes a 15% platform fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="business-name">Business Name</Label>
              <Input
                id="business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your Business LLC"
                data-testid="input-business-name"
              />
            </div>

            <div className="space-y-3">
              <Label>Account Type</Label>
              <RadioGroup
                value={accountType}
                onValueChange={(value) => setAccountType(value as "express" | "standard")}
              >
                <div className="flex items-start space-x-3 rounded-md border p-4">
                  <RadioGroupItem value="express" id="express" data-testid="radio-express" />
                  <div className="flex-1">
                    <Label htmlFor="express" className="font-semibold cursor-pointer">
                      Express Account (Recommended)
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create a new Stripe account managed by Event Hub. Quick setup with simplified onboarding.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 rounded-md border p-4">
                  <RadioGroupItem value="standard" id="standard" data-testid="radio-standard" />
                  <div className="flex-1">
                    <Label htmlFor="standard" className="font-semibold cursor-pointer">
                      Standard Account
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Link your existing Stripe account. You'll have full control through your own Stripe dashboard.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div className="bg-muted p-4 rounded-md space-y-2">
              <h4 className="font-semibold text-sm">Payment Details</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Platform fee: 15% per booking</li>
                <li>• Customers pay via Stripe with secure checkout</li>
                <li>• Funds are transferred to your account automatically</li>
                <li>• You set your own pricing and packages</li>
              </ul>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleCreateAccount}
              disabled={isCreating || !businessName.trim()}
              className="flex-1"
              data-testid="button-continue"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                "Continue to Stripe"
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setLocation("/vendor/dashboard")}
              disabled={isCreating}
              data-testid="button-skip"
            >
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
