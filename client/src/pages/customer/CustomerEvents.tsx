import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, DollarSign, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface CustomerEventsProps {
  customer: {
    id: string;
    name: string;
    email: string;
  };
}

interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  status: "planning" | "booked" | "completed";
  budget: {
    total: number;
    spent: number;
    remaining: number;
  };
  vendors: {
    id: string;
    name: string;
    serviceType: string;
    status: "pending" | "confirmed" | "completed";
  }[];
}

// Mock data - TODO: Replace with real API data
const mockEvents: Event[] = [
  {
    id: "1",
    title: "Sarah's Wedding",
    date: "2025-06-15",
    location: "San Francisco, CA",
    status: "planning",
    budget: {
      total: 50000,
      spent: 15000,
      remaining: 35000,
    },
    vendors: [
      {
        id: "v1",
        name: "Elegant Photos",
        serviceType: "Photography",
        status: "confirmed",
      },
      {
        id: "v2",
        name: "Gourmet Catering Co.",
        serviceType: "Catering",
        status: "pending",
      },
    ],
  },
];

export default function CustomerEvents({ customer }: CustomerEventsProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [events] = useState<Event[]>(mockEvents);

  const getStatusBadge = (status: Event["status"]) => {
    switch (status) {
      case "planning":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          <Clock className="h-3 w-3 mr-1" />
          Planning
        </Badge>;
      case "booked":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Booked
        </Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Completed
        </Badge>;
    }
  };

  const getVendorStatusBadge = (status: "pending" | "confirmed" | "completed") => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-xs">Pending</Badge>;
      case "confirmed":
        return <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Confirmed</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700 border-gray-200">Completed</Badge>;
    }
  };

  if (selectedEvent) {
    // Event Detail View
    return (
      <div className="space-y-6">
        <div>
          <Button
            variant="ghost"
            onClick={() => setSelectedEvent(null)}
            className="mb-4"
            data-testid="button-back-to-events"
          >
            ← Back to events
          </Button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-event-title">
                {selectedEvent.title}
              </h1>
              <div className="flex items-center gap-4 mt-2 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(selectedEvent.date), "MMMM d, yyyy")}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {selectedEvent.location}
                </span>
              </div>
            </div>
            {getStatusBadge(selectedEvent.status)}
          </div>
        </div>

        {/* Budget Card */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Budget Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Budget</p>
                <p className="text-2xl font-bold">${selectedEvent.budget.total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Spent</p>
                <p className="text-2xl font-bold text-red-600">${selectedEvent.budget.spent.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Remaining</p>
                <p className="text-2xl font-bold text-green-600">${selectedEvent.budget.remaining.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(selectedEvent.budget.spent / selectedEvent.budget.total) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Booked Vendors */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle>Booked Vendors</CardTitle>
            <CardDescription>
              {selectedEvent.vendors.length} vendor{selectedEvent.vendors.length !== 1 ? 's' : ''} booked
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {selectedEvent.vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                  data-testid={`vendor-item-${vendor.id}`}
                >
                  <div>
                    <p className="font-medium">{vendor.name}</p>
                    <p className="text-sm text-muted-foreground">{vendor.serviceType}</p>
                  </div>
                  {getVendorStatusBadge(vendor.status)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Next Steps */}
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Confirm catering vendor</p>
                  <p className="text-sm text-muted-foreground">Gourmet Catering Co. is awaiting confirmation</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 border rounded-lg">
                <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Finalize venue booking</p>
                  <p className="text-sm text-muted-foreground">Complete payment to secure your date</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Events List View
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-events-title">
            My Events
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your upcoming events and bookings
          </p>
        </div>
        <Button data-testid="button-create-event">
          Create New Event
        </Button>
      </div>

      {events.length === 0 ? (
        <Card className="rounded-xl shadow-sm">
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No events yet</h3>
            <p className="text-muted-foreground mb-4">
              Start planning your first event to see it here
            </p>
            <Button data-testid="button-plan-first-event">
              Plan Your First Event
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => (
            <Card
              key={event.id}
              className="rounded-xl shadow-sm hover-elevate cursor-pointer"
              onClick={() => setSelectedEvent(event)}
              data-testid={`event-card-${event.id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold">{event.title}</h3>
                      {getStatusBadge(event.status)}
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(event.date), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {event.location}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {event.vendors.length} vendor{event.vendors.length !== 1 ? 's' : ''} booked
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        ${event.budget.spent.toLocaleString()} of ${event.budget.total.toLocaleString()} spent
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
