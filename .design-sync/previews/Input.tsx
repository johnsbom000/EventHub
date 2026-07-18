import { Input, Label } from "eventhub-ui";

export const EventNameField = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="event-name">Event name</Label>
    <Input id="event-name" placeholder="e.g. Harper & Liam's Wedding" />
  </div>
);

export const EmailField = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="host-email">Host email</Label>
    <Input id="host-email" type="email" defaultValue="harper.lane@gmail.com" />
  </div>
);

export const SearchField = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="vendor-search">Find a vendor</Label>
    <Input id="vendor-search" type="search" placeholder="Search caterers in Salt Lake City" />
  </div>
);

export const GuestCountAndDisabled = () => (
  <div style={{ display: "grid", gap: 16, width: 320 }}>
    <div style={{ display: "grid", gap: 6 }}>
      <Label htmlFor="guest-count">Expected guests</Label>
      <Input id="guest-count" type="number" defaultValue={140} />
    </div>
    <div style={{ display: "grid", gap: 6 }}>
      <Label htmlFor="booking-id">Booking reference</Label>
      <Input id="booking-id" defaultValue="EVT-2026-04817" disabled />
    </div>
  </div>
);
