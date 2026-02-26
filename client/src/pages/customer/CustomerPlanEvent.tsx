import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function CustomerPlanEvent() {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-plan-event-title">
          Plan a new event
        </h1>
        <p className="text-muted-foreground mt-1">
          Start by browsing available vendors.
        </p>
      </div>

      <div className="max-w-2xl">
        {/* Browse Vendors Option */}
        <Card className="rounded-xl shadow-sm hover-elevate cursor-pointer group" onClick={() => setLocation("/browse")}>
          <CardHeader className="pb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-[20px]">Browse vendors</CardTitle>
            <CardDescription className="text-base">
              Explore our curated marketplace of professional event vendors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Search by service type, location, and availability</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>View portfolios, reviews, and pricing</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Contact vendors directly</span>
              </li>
            </ul>
            <Button
              className="w-full group-hover:bg-primary/90"
              data-testid="button-browse-vendors"
            >
              Start browsing
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
