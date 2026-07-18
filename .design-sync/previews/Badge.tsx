import { Badge } from "eventhub-ui";

export const StatusBadges = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 320 }}>
    <Badge>Featured</Badge>
    <Badge variant="secondary">Verified host</Badge>
    <Badge variant="outline">Instant book</Badge>
    <Badge variant="destructive">Sold out</Badge>
  </div>
);

export const VendorTags = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 320 }}>
    <Badge variant="secondary">New</Badge>
    <Badge variant="secondary">Founding vendor</Badge>
    <Badge variant="outline">Serves 50 mi</Badge>
    <Badge variant="outline">Weekends only</Badge>
  </div>
);

export const InlineOnCard = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: 300 }}>
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ fontWeight: 600, fontSize: 15 }}>Copper Table Catering</div>
      <div style={{ fontSize: 13, opacity: 0.65 }}>Farm-to-table · from $42/guest</div>
    </div>
    <Badge>Featured</Badge>
  </div>
);
