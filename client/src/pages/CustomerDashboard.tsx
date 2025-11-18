import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/Navigation";
import { 
  User, 
  Calendar, 
  MessageSquare, 
  PlusCircle, 
  Search,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import CustomerProfile from "./customer/CustomerProfile";
import CustomerEvents from "./customer/CustomerEvents";
import CustomerMessages from "./customer/CustomerMessages";
import CustomerPlanEvent from "./customer/CustomerPlanEvent";

interface Customer {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

type Section = "profile" | "events" | "messages" | "plan" | "browse";

const menuItems = [
  { id: "profile" as Section, label: "My profile", icon: User, path: "/dashboard/profile" },
  { id: "events" as Section, label: "My Events", icon: Calendar, path: "/dashboard/events" },
  { id: "messages" as Section, label: "Messages", icon: MessageSquare, path: "/dashboard/messages" },
  { id: "plan" as Section, label: "Plan New Event", icon: PlusCircle, path: "/dashboard/plan" },
  { id: "browse" as Section, label: "Browse Vendors", icon: Search, path: "/browse" },
];

export default function CustomerDashboard() {
  const [location, setLocation] = useLocation();

  // Fetch current customer
  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customer/me"],
    retry: false,
  });

  useEffect(() => {
    // Redirect to login if not authenticated
    const token = localStorage.getItem("customerToken");
    if (!token && !isLoading) {
      setLocation("/login");
    }
  }, [isLoading, setLocation]);

  // Derive active section from URL (single source of truth)
  const activeSection = useMemo<Section>(() => {
    if (location.startsWith("/dashboard/events")) return "events";
    if (location.startsWith("/dashboard/messages")) return "messages";
    if (location.startsWith("/dashboard/plan")) return "plan";
    // Default to profile for /dashboard and /dashboard/profile
    return "profile";
  }, [location]);

  const handleSectionClick = (section: Section, path: string) => {
    setLocation(path);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="w-72 flex-shrink-0">
            <div className="sticky top-8">
              <h2 className="text-2xl font-bold mb-6" data-testid="text-dashboard-title">
                My Dashboard
              </h2>
              
              <nav className="space-y-1">
                {menuItems.map((item) => {
                  const isActive = activeSection === item.id;
                  const Icon = item.icon;
                  
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSectionClick(item.id, item.path)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors",
                        isActive
                          ? "bg-card shadow-sm font-medium"
                          : "hover-elevate"
                      )}
                      data-testid={`button-nav-${item.id}`}
                    >
                      <Icon className={cn(
                        "h-5 w-5",
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        isActive ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {item.label}
                      </span>
                      {isActive && (
                        <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {activeSection === "profile" && <CustomerProfile customer={customer} />}
            {activeSection === "events" && <CustomerEvents customer={customer} />}
            {activeSection === "messages" && <CustomerMessages customer={customer} />}
            {activeSection === "plan" && <CustomerPlanEvent />}
          </main>
        </div>
      </div>
    </div>
  );
}
