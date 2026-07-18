import { Tabs, TabsList, TabsTrigger, TabsContent, Separator } from "eventhub-ui";
import { Star } from "lucide-react";

export const VendorDetailTabs = () => (
  <Tabs defaultValue="overview" style={{ width: 380 }}>
    <TabsList>
      <TabsTrigger value="overview">Overview</TabsTrigger>
      <TabsTrigger value="reviews">Reviews</TabsTrigger>
      <TabsTrigger value="availability">Availability</TabsTrigger>
    </TabsList>
    <TabsContent value="overview">
      <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85, margin: 0 }}>
        Bella Fiori Florals designs romantic, garden-style arrangements for Salt Lake City
        weddings and events. Packages include ceremony florals, centerpieces, and full
        install and teardown.
      </p>
      <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 14 }}>
        <span><strong>From $850</strong></span>
        <Separator orientation="vertical" style={{ height: 20 }} />
        <span style={{ opacity: 0.7 }}>Serves within 50 mi</span>
      </div>
    </TabsContent>
    <TabsContent value="reviews">
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 8 }}>
        <Star style={{ width: 16, height: 16 }} />
        <span style={{ fontWeight: 600 }}>4.9</span>
        <span style={{ opacity: 0.6 }}>· 128 reviews</span>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85, margin: 0 }}>
        "Absolutely stunning arrangements for our June wedding — the peony arch was the
        centerpiece of every photo." — Marisol V., June 2026
      </p>
    </TabsContent>
    <TabsContent value="availability">
      <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.85, margin: 0 }}>
        Next open dates in Salt Lake City:
      </p>
      <ul style={{ fontSize: 14, opacity: 0.85, marginTop: 8, paddingLeft: 18, lineHeight: 1.8 }}>
        <li>Sat, June 14, 2026 — available</li>
        <li>Sat, July 19, 2026 — available</li>
        <li>Sat, Aug 9, 2026 — 1 slot left</li>
      </ul>
    </TabsContent>
  </Tabs>
);

export const BookingTabs = () => (
  <Tabs defaultValue="details" style={{ width: 380 }}>
    <TabsList>
      <TabsTrigger value="details">Details</TabsTrigger>
      <TabsTrigger value="payment">Payment</TabsTrigger>
    </TabsList>
    <TabsContent value="details">
      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.7 }}>Event date</span><span style={{ fontWeight: 600 }}>June 14, 2026</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.7 }}>Guests</span><span style={{ fontWeight: 600 }}>120</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.7 }}>Venue</span><span style={{ fontWeight: 600 }}>The Gathering Place</span>
        </div>
      </div>
    </TabsContent>
    <TabsContent value="payment">
      <div style={{ fontSize: 14, lineHeight: 1.8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.7 }}>Deposit paid</span><span style={{ fontWeight: 600 }}>$425.00</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.7 }}>Balance due</span><span style={{ fontWeight: 600 }}>$425.00</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ opacity: 0.7 }}>Due by</span><span style={{ fontWeight: 600 }}>May 31, 2026</span>
        </div>
      </div>
    </TabsContent>
  </Tabs>
);
