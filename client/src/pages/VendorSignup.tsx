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

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  businessName: z.string().min(2, "Business name must be at least 2 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function VendorSignup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showProfileWizard, setShowProfileWizard] = useState(false);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      businessName: "",
    },
  });

  async function onSubmit(data: SignupFormData) {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/vendor/signup", {
        email: data.email,
        password: data.password,
        businessName: data.businessName,
      });

      const { token, vendorAccount } = await response.json();
      
      // Store token in localStorage
      // localStorage.setItem("vendorToken", token);
      localStorage.setItem("vendorAccountId", vendorAccount.id);

      toast({
        title: "Account created",
        description: "Welcome to Event Hub! Let's set up your vendor profile.",
      });

      // Show profile wizard instead of redirecting
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
      // Navigate to create listing page
      setLocation("/vendor/listings/new");
    } else {
      // Navigate to dashboard
      setLocation("/vendor/dashboard");
    }
  };

  // If profile wizard is active, show it instead of signup form
  if (showProfileWizard) {
    return <VendorProfileWizard onComplete={handleProfileComplete} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create Vendor Account</CardTitle>
          <CardDescription>
            Join Event Hub and start receiving bookings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
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

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="vendor@example.com"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
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
                control={form.control}
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
                  disabled={isLoading}
                  data-testid="button-signup"
                >
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLocation("/vendor/login")}
                  data-testid="link-login"
                >
                  Already have an account? Sign in
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
