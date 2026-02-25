import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import Navigation from "@/components/Navigation";
import { Badge } from "@/components/ui/badge";
import { 
  User, 
  Calendar, 
  MessageSquare, 
  PlusCircle, 
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
  displayName?: string | null;
  profilePhotoDataUrl?: string | null;
  email: string;
  createdAt: string;
}

type Section = "profile" | "events" | "messages" | "plan";

const menuItems = [
  { id: "profile" as Section, label: "My profile", icon: User, path: "/dashboard/profile" },
  { id: "events" as Section, label: "My Events", icon: Calendar, path: "/dashboard/events" },
  { id: "messages" as Section, label: "Messages", icon: MessageSquare, path: "/dashboard/messages" },
  { id: "plan" as Section, label: "Plan New Event", icon: PlusCircle, path: "/dashboard/plan" },
];

export default function CustomerDashboard() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth0();

  // Fetch current customer
  const { data: customer, isLoading, error } = useQuery<Customer>({
    queryKey: ["/api/customer/me"],
    enabled: isAuthenticated,
    retry: false,
  });

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/customer/messages/unread-count"],
    enabled: isAuthenticated,
    refetchInterval: 10000,
    staleTime: 0,
  });
  const unreadCount = Math.max(0, Number(unreadData?.unreadCount || 0));

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

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

  if (isLoading || isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!customer) {
    const errorMessage =
      error instanceof Error ? error.message : "We are setting up your customer profile. Refresh in a few seconds if this does not update.";

    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="rounded-xl border border-border bg-card p-6">
            <h1 className="text-2xl font-semibold mb-2">Loading your dashboard</h1>
            <p className="text-muted-foreground">
              {errorMessage}
            </p>
          </div>
        </div>
      </div>
    );
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
                      {item.id === "messages" && unreadCount > 0 ? (
                        <Badge
                          className={cn(
                            "h-5 min-w-5 justify-center rounded-full bg-cyan-600 px-1 text-[10px] text-white",
                            !isActive && "ml-auto"
                          )}
                        >
                          {unreadCount}
                        </Badge>
                      ) : null}
                      {isActive && (
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 text-muted-foreground",
                            !(item.id === "messages" && unreadCount > 0) && "ml-auto"
                          )}
                        />
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
