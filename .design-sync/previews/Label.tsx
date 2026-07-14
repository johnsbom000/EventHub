import { Label, Input, Checkbox } from "eventhub-ui";

export const WithInput = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="venue-name">Venue name</Label>
    <Input id="venue-name" defaultValue="The Gathering Place at Gardner Village" />
  </div>
);

export const WithCheckbox = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <Checkbox id="agree-terms" defaultChecked />
    <Label htmlFor="agree-terms">I agree to EventHub's booking terms</Label>
  </div>
);

export const RequiredField = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="event-date">
      Event date <span style={{ color: "#e07a6a" }}>*</span>
    </Label>
    <Input id="event-date" type="date" defaultValue="2026-06-14" />
  </div>
);
