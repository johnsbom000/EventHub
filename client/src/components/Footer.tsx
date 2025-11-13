import { Link } from "wouter";
import { Calendar } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-card border-t">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-6 w-6 text-primary" />
              <span className="font-serif text-xl font-bold">EventHub</span>
            </div>
            <p className="text-muted-foreground mb-4">
              Your trusted platform for finding and booking the perfect event vendors.
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">For Customers</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/browse" className="text-muted-foreground hover:text-foreground" data-testid="link-footer-browse">
                  Browse Vendors
                </Link>
              </li>
              <li>
                <Link href="/planner" className="text-muted-foreground hover:text-foreground" data-testid="link-footer-planner">
                  Event Planner
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">For Vendors</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/vendor/signup" className="text-muted-foreground hover:text-foreground" data-testid="link-footer-vendor-signup">
                  Become a Vendor
                </Link>
              </li>
              <li>
                <Link href="/vendor/dashboard" className="text-muted-foreground hover:text-foreground" data-testid="link-footer-vendor-dashboard">
                  Vendor Dashboard
                </Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 EventVibe. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
