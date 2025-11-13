import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import Logo from "@/components/Logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Navigation() {
  const [showVendorPrompt, setShowVendorPrompt] = useState(false);
  
  // TODO: Replace with actual auth state check
  const isLoggedIn = false;
  const userRole = null; // 'vendor' | 'admin' | 'customer' | null

  const handleVendorsClick = () => {
    if (!isLoggedIn) {
      setShowVendorPrompt(true);
    } else if (userRole === 'vendor') {
      window.location.href = '/vendor/dashboard';
    } else if (userRole === 'admin') {
      window.location.href = '/admin';
    } else {
      setShowVendorPrompt(true);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2 hover-elevate active-elevate-2 px-3 py-2 rounded-lg -ml-3" data-testid="link-home">
              <Logo className="h-6 w-6" />
              <span className="font-serif text-xl font-bold">Event Hub</span>
            </Link>

            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="default"
                onClick={handleVendorsClick}
                data-testid="button-vendors"
              >
                Vendors
              </Button>
              <Link href="/login">
                <Button variant="outline" size="default" className="bg-[#9edbc0]" data-testid="button-login">
                  Login / Sign up
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <Dialog open={showVendorPrompt} onOpenChange={setShowVendorPrompt}>
        <DialogContent data-testid="dialog-vendor-prompt">
          <DialogHeader>
            <DialogTitle>Are you a new vendor or an existing vendor?</DialogTitle>
            <DialogDescription>
              Choose the option that applies to you
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Link href="/vendor/signup">
              <Button 
                className="w-full" 
                size="lg"
                onClick={() => setShowVendorPrompt(false)}
                data-testid="button-new-vendor"
              >
                New Vendor - Sign Up
              </Button>
            </Link>
            <Link href="/vendor/login">
              <Button 
                variant="outline" 
                className="w-full"
                size="lg"
                onClick={() => setShowVendorPrompt(false)}
                data-testid="button-existing-vendor"
              >
                Existing Vendor - Login
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
