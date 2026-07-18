import { Button } from "eventhub-ui";
import { Calendar, Heart, Plus } from "lucide-react";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button variant="default">Book this vendor</Button>
    <Button variant="secondary">Save to favorites</Button>
    <Button variant="outline">View details</Button>
    <Button variant="ghost">Message host</Button>
    <Button variant="destructive">Cancel booking</Button>
    <Button variant="link">See all reviews</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
    <Button size="icon" aria-label="Add">
      <Plus style={{ width: 16, height: 16 }} />
    </Button>
  </div>
);

export const WithIcons = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button variant="default">
      <Calendar style={{ width: 16, height: 16, marginRight: 8 }} />
      Check availability
    </Button>
    <Button variant="outline">
      <Heart style={{ width: 16, height: 16, marginRight: 8 }} />
      Add to shortlist
    </Button>
  </div>
);

export const States = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button variant="default" disabled>
      Unavailable
    </Button>
    <Button variant="secondary" disabled>
      Sold out
    </Button>
    <Button variant="outline" disabled>
      Pending review
    </Button>
  </div>
);
