import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Calendar } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SignupResponse {
  emailExists?: boolean;
  email?: string;
  message?: string;
  token?: string;
  user?: { id: string; name: string; email: string; role: string };
}

interface LoginResponse {
  userNotFound?: boolean;
  email?: string;
  message?: string;
  token?: string;
  user?: { 
    id: string; 
    name?: string; 
    email: string; 
    role: string;
    businessName?: string;
    profileComplete?: boolean;
    stripeOnboardingComplete?: boolean;
  };
}

export default function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showCreateAccountPrompt, setShowCreateAccountPrompt] = useState(false);
  
  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      // Handle "user not found" case
      if (res.status === 404 && json.userNotFound) {
        return json; // Return the response to handle in onSuccess
      }

      if (!res.ok) {
        throw new Error(json.error || "Login failed");
      }

      return json;
    },
    onSuccess: (data: LoginResponse) => {
      // Check if user was not found
      if (data.userNotFound) {
        setShowCreateAccountPrompt(true);
        setSignupEmail(data.email || loginEmail);
        return;
      }

      // Successful login
      if (data.token) {
        const userRole = data.user?.role || "customer";
        
        // Clear both tokens first to prevent token mix-ups
        localStorage.removeItem("customerToken");
        localStorage.removeItem("vendorToken");
        
        // Store token based on role
        if (userRole === "vendor") {
          localStorage.setItem("vendorToken", data.token);
        } else {
          // Store for both customer and admin roles
          localStorage.setItem("customerToken", data.token);
        }
        
        toast({
          title: "Welcome back!",
          description: "You've successfully logged in.",
        });
        onOpenChange(false);
        
        // Redirect based on role
        if (userRole === "vendor") {
          setLocation("/vendor/dashboard");
        } else if (userRole === "admin") {
          setLocation("/admin");
        } else {
          setLocation("/dashboard");
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await fetch("/api/customer/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      // Handle "email exists" case
      if (res.status === 400 && json.emailExists) {
        return json; // Return the response to handle in onSuccess
      }

      if (!res.ok) {
        throw new Error(json.error || "Signup failed");
      }

      return json;
    },
    onSuccess: (data: SignupResponse) => {
      // Check if email already exists
      if (data.emailExists) {
        setShowLoginPrompt(true);
        setLoginEmail(data.email || signupEmail);
        return;
      }

      // Successful signup
      if (data.token) {
        const userRole = data.user?.role || "customer";
        
        // Clear both tokens first to prevent token mix-ups
        localStorage.removeItem("customerToken");
        localStorage.removeItem("vendorToken");
        
        // Store for both customer and admin roles (vendors use separate signup)
        localStorage.setItem("customerToken", data.token);
        
        toast({
          title: "Welcome to Event Hub!",
          description: "Your account has been created successfully.",
        });
        onOpenChange(false);
        
        // Redirect based on role
        if (userRole === "admin") {
          setLocation("/admin");
        } else {
          setLocation("/dashboard");
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setShowCreateAccountPrompt(false);
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupPassword !== signupConfirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    setShowLoginPrompt(false);
    signupMutation.mutate({ 
      name: signupName, 
      email: signupEmail, 
      password: signupPassword 
    });
  };

  const switchToSignup = () => {
    setActiveTab("signup");
    setSignupName("");
    setSignupEmail(loginEmail);
    setSignupPassword("");
    setSignupConfirmPassword("");
    setShowCreateAccountPrompt(false);
  };

  const switchToLogin = () => {
    setActiveTab("login");
    setLoginEmail(signupEmail);
    setLoginPassword("");
    setShowLoginPrompt(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="flex flex-row items-center gap-2 space-y-0">
          <Calendar className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <DialogTitle className="font-serif text-2xl">Event Hub</DialogTitle>
            <DialogDescription>
              Sign in to your account or create a new one
            </DialogDescription>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "signup")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
            <TabsTrigger value="signup" data-testid="tab-signup">Create account</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4">
            {showCreateAccountPrompt && (
              <Alert data-testid="alert-user-not-found">
                <AlertDescription>
                  We couldn't find an account with this email. Would you like to create one?
                  <Button
                    onClick={switchToSignup}
                    variant="ghost"
                    className="h-auto p-0 ml-1 text-primary hover:text-primary/80"
                    data-testid="button-switch-to-signup"
                  >
                    Create account with this email
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  data-testid="input-login-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  data-testid="input-login-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-login-submit"
              >
                {loginMutation.isPending ? "Logging in..." : "Login"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            {showLoginPrompt && (
              <Alert data-testid="alert-email-exists">
                <AlertDescription>
                  You already have an account with this email. Please log in instead.
                  <Button
                    onClick={switchToLogin}
                    variant="ghost"
                    className="h-auto p-0 ml-1 text-primary hover:text-primary/80"
                    data-testid="button-switch-to-login"
                  >
                    Go to login
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Name</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="John Doe"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  required
                  data-testid="input-signup-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                  data-testid="input-signup-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  required
                  minLength={8}
                  data-testid="input-signup-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                <Input
                  id="signup-confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  data-testid="input-signup-confirm-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={signupMutation.isPending}
                data-testid="button-signup-submit"
              >
                {signupMutation.isPending ? "Creating account..." : "Create account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
