import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "eventhub-ui";
import { MapPin, Star } from "lucide-react";

export const VendorCard = () => (
  <Card style={{ width: 360 }}>
    <CardHeader>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <CardTitle>Bella Fiori Florals</CardTitle>
          <CardDescription>Wedding & event floral design</CardDescription>
        </div>
        <Badge variant="secondary">Featured</Badge>
      </div>
    </CardHeader>
    <CardContent>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 8 }}>
        <Star style={{ width: 16, height: 16 }} />
        <span style={{ fontWeight: 600 }}>4.9</span>
        <span style={{ opacity: 0.6 }}>(128 reviews)</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, opacity: 0.75 }}>
        <MapPin style={{ width: 16, height: 16 }} />
        Salt Lake City, UT · Serves within 50 mi
      </div>
    </CardContent>
    <CardFooter style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 18, fontWeight: 600 }}>
        From $850
      </span>
      <Button>Check availability</Button>
    </CardFooter>
  </Card>
);

export const SimpleCard = () => (
  <Card style={{ width: 360 }}>
    <CardHeader>
      <CardTitle>Booking confirmed</CardTitle>
      <CardDescription>Your event is all set for June 14, 2026.</CardDescription>
    </CardHeader>
    <CardContent>
      <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, opacity: 0.85 }}>
        We've notified the vendor and added the event to your calendar. You'll receive
        a reminder 48 hours before the event with arrival details and a contact number.
      </p>
    </CardContent>
    <CardFooter>
      <Button variant="outline">View booking details</Button>
    </CardFooter>
  </Card>
);
