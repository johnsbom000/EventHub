import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Sparkles, ArrowRight } from "lucide-react";
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
          How would you like to get started?
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Browse Vendors Option */}
        <Card className="rounded-xl shadow-sm hover-elevate cursor-pointer group" onClick={() => setLocation("/browse")}>
          <CardHeader className="pb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Browse vendors</CardTitle>
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

        {/* Curated Recommendations Option */}
        <Card className="rounded-xl shadow-sm hover-elevate cursor-pointer group" onClick={() => setLocation("/planner")}>
          <CardHeader className="pb-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Help me find the best matches</CardTitle>
            <CardDescription className="text-base">
              Answer a few questions and we'll recommend the perfect vendors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 mb-6 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Tell us about your event details</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Set your budget and preferences</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Get personalized vendor recommendations</span>
              </li>
            </ul>
            <Button
              className="w-full group-hover:bg-primary/90"
              data-testid="button-get-recommendations"
            >
              Get started
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Additional Info */}
      <Card className="rounded-xl shadow-sm bg-primary/5 border-primary/20">
        <CardContent className="p-6">
          <h3 className="font-medium mb-2">Not sure where to start?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Our curated recommendation flow will help you find vendors that match your specific needs,
            budget, and style preferences. You can always browse the full marketplace later.
          </p>
          <div className="flex items-center gap-2 text-sm text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="font-medium">We recommend starting with personalized matches</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
