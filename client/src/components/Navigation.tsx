import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Calendar, Menu, X } from "lucide-react";
import { useState } from "react";

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-4">
          <Link href="/" className="flex items-center gap-2 hover-elevate active-elevate-2 px-3 py-2 rounded-lg -ml-3" data-testid="link-home">
            <Calendar className="h-6 w-6 text-primary" />
            <span className="font-serif text-xl font-bold">EventVibe</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/browse" className="text-sm font-medium hover-elevate active-elevate-2 px-3 py-2 rounded-lg" data-testid="link-browse">
              Browse Vendors
            </Link>
            <Link href="/planner" className="text-sm font-medium hover-elevate active-elevate-2 px-3 py-2 rounded-lg" data-testid="link-planner">
              Event Planner
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/vendor/signup">
              <Button variant="outline" size="default" data-testid="button-become-vendor">
                Become a Vendor
              </Button>
            </Link>
            <Link href="/login">
              <Button size="default" data-testid="button-login">
                Login / Sign up
              </Button>
            </Link>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <div className="px-4 py-4 space-y-3">
            <Link href="/browse" className="block" data-testid="link-browse-mobile">
              <Button variant="ghost" className="w-full justify-start" onClick={() => setMobileMenuOpen(false)}>
                Browse Vendors
              </Button>
            </Link>
            <Link href="/planner" className="block" data-testid="link-planner-mobile">
              <Button variant="ghost" className="w-full justify-start" onClick={() => setMobileMenuOpen(false)}>
                Event Planner
              </Button>
            </Link>
            <Link href="/vendor/signup" className="block" data-testid="link-vendor-signup-mobile">
              <Button variant="outline" className="w-full" onClick={() => setMobileMenuOpen(false)}>
                Become a Vendor
              </Button>
            </Link>
            <Link href="/login" className="block" data-testid="link-login-mobile">
              <Button className="w-full" onClick={() => setMobileMenuOpen(false)}>
                Login / Sign up
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
