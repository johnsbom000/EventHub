import { Checkbox, Label } from "eventhub-ui";

export const States = () => (
  <div style={{ display: "grid", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="cb-checked" defaultChecked />
      <Label htmlFor="cb-checked">Send me a booking confirmation</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="cb-unchecked" />
      <Label htmlFor="cb-unchecked">Add event to my calendar</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="cb-disabled" disabled />
      <Label htmlFor="cb-disabled">Reschedule protection (unavailable)</Label>
    </div>
  </div>
);

export const BookingAddOns = () => (
  <div style={{ display: "grid", gap: 14, width: 340 }}>
    <div style={{ fontWeight: 600, fontSize: 14 }}>Included add-ons</div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="addon-setup" defaultChecked />
      <Label htmlFor="addon-setup">Setup &amp; teardown (+$150)</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="addon-travel" defaultChecked />
      <Label htmlFor="addon-travel">Travel included (within 50 mi)</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="addon-lighting" />
      <Label htmlFor="addon-lighting">Ambient lighting package (+$275)</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Checkbox id="addon-late" />
      <Label htmlFor="addon-late">Late-night extension, until 1 AM (+$400)</Label>
    </div>
  </div>
);
