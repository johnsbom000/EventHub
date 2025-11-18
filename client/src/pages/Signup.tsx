import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VendorProfileWizard } from "@/features/vendor/profile-wizard/VendorProfileWizard";

// Step 1: Basic Info
const basicInfoSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Step 3: Vendor-specific info
const vendorInfoSchema = z.object({
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
});

type BasicInfoFormData = z.infer<typeof basicInfoSchema>;
type VendorInfoFormData = z.infer<typeof vendorInfoSchema>;

type SignupStep = "basic" | "role" | "vendor" | "complete";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<SignupStep>("basic");
  const [basicInfo, setBasicInfo] = useState<BasicInfoFormData | null>(null);
  const [isVendor, setIsVendor] = useState(false);
  const [showProfileWizard, setShowProfileWizard] = useState(false);

  const basicForm = useForm<BasicInfoFormData>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const vendorForm = useForm<VendorInfoFormData>({
    resolver: zodResolver(vendorInfoSchema),
    defaultValues: {
      businessName: "",
    },
  });

  // Step 1: Basic info submission
  function onBasicInfoSubmit(data: BasicInfoFormData) {
    setBasicInfo(data);
    setStep("role");
  }

  // Step 2: Role selection
  function handleRoleSelection(vendor: boolean) {
    setIsVendor(vendor);
    if (vendor) {
      setStep("vendor");
    } else {
      // Create customer account immediately
      createCustomerAccount();
    }
  }

  // Create customer account
  async function createCustomerAccount() {
    if (!basicInfo) return;

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/customer/signup", {
        name: basicInfo.name,
        email: basicInfo.email,
        password: basicInfo.password,
      });

      const { token, user } = await response.json();
      
      // Store token in localStorage
      localStorage.setItem("customerToken", token);
      localStorage.setItem("customerId", user.id);

      toast({
        title: "Account created",
        description: "Welcome to Event Hub!",
      });

      // Redirect to home page
      setLocation("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: error.message || "Could not create account",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Step 3: Vendor info submission
  async function onVendorInfoSubmit(data: VendorInfoFormData) {
    if (!basicInfo) return;

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/vendor/signup", {
        email: basicInfo.email,
        password: basicInfo.password,
        businessName: data.businessName,
      });

      const { token, vendorAccount } = await response.json();
      
      // Store token in localStorage
      localStorage.setItem("vendorToken", token);
      localStorage.setItem("vendorAccountId", vendorAccount.id);

      toast({
        title: "Account created",
        description: "Welcome to Event Hub! Let's set up your vendor profile.",
      });

      // Show profile wizard
      setShowProfileWizard(true);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: error.message || "Could not create account",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Handle profile wizard completion
  const handleProfileComplete = (createListing: boolean) => {
    if (createListing) {
      setLocation("/vendor/listings/new");
    } else {
      setLocation("/vendor/dashboard");
    }
  };

  // If profile wizard is active, show it
  if (showProfileWizard) {
    return <VendorProfileWizard onComplete={handleProfileComplete} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {/* Step 1: Basic Info */}
        {step === "basic" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Create Account</CardTitle>
              <CardDescription>
                Join Event Hub to plan events or offer services
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...basicForm}>
                <form onSubmit={basicForm.handleSubmit(onBasicInfoSubmit)} className="space-y-4">
                  <FormField
                    control={basicForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="John Doe"
                            data-testid="input-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={basicForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="you@example.com"
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={basicForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="••••••••"
                            data-testid="input-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={basicForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="••••••••"
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      className="w-full"
                      data-testid="button-continue"
                    >
                      Continue
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setLocation("/login")}
                      data-testid="link-login"
                    >
                      Already have an account? Sign in
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </>
        )}

        {/* Step 2: Role Selection */}
        {step === "role" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Are you a vendor?</CardTitle>
              <CardDescription>
                Choose how you want to use Event Hub
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => handleRoleSelection(true)}
                className="w-full h-auto py-6 flex flex-col items-start gap-1"
                variant="outline"
                disabled={isLoading}
                data-testid="button-vendor"
              >
                <span className="text-lg font-semibold">Yes, I'm a vendor</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Offer your services and receive bookings
                </span>
              </Button>

              <Button
                onClick={() => handleRoleSelection(false)}
                className="w-full h-auto py-6 flex flex-col items-start gap-1"
                variant="outline"
                disabled={isLoading}
                data-testid="button-customer"
              >
                <span className="text-lg font-semibold">No, I'm planning an event</span>
                <span className="text-sm text-muted-foreground font-normal">
                  Find and book vendors for your event
                </span>
              </Button>

              <Button
                onClick={() => setStep("basic")}
                variant="ghost"
                className="w-full mt-4"
                disabled={isLoading}
                data-testid="button-back"
              >
                Back
              </Button>
            </CardContent>
          </>
        )}

        {/* Step 3: Vendor Info */}
        {step === "vendor" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Vendor Details</CardTitle>
              <CardDescription>
                Tell us about your business
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...vendorForm}>
                <form onSubmit={vendorForm.handleSubmit(onVendorInfoSubmit)} className="space-y-4">
                  <FormField
                    control={vendorForm.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Your Company LLC"
                            data-testid="input-business-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                      data-testid="button-create-vendor-account"
                    >
                      {isLoading ? "Creating account..." : "Create Vendor Account"}
                    </Button>

                    <Button
                      type="button"
                      onClick={() => setStep("role")}
                      variant="ghost"
                      className="w-full"
                      disabled={isLoading}
                      data-testid="button-back-to-role"
                    >
                      Back
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
