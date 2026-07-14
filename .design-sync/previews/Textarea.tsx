import { Textarea, Label } from "eventhub-ui";

export const MessageToHost = () => (
  <div style={{ display: "grid", gap: 6, width: 380 }}>
    <Label htmlFor="host-message">Message to host</Label>
    <Textarea
      id="host-message"
      rows={4}
      defaultValue="Hi Marisol! We're planning a 140-guest reception at The Gathering Place on June 14, 2026. Could you share your plated dinner options and whether tastings are available in May?"
    />
  </div>
);

export const SpecialRequests = () => (
  <div style={{ display: "grid", gap: 6, width: 380 }}>
    <Label htmlFor="special-requests">Special requests</Label>
    <Textarea
      id="special-requests"
      placeholder="Tell the vendor about dietary needs, accessibility, timing, or anything else that would make your event perfect."
    />
  </div>
);

export const CancellationNote = () => (
  <div style={{ display: "grid", gap: 6, width: 380 }}>
    <Label htmlFor="cancel-note">Reason for cancellation (optional)</Label>
    <Textarea
      id="cancel-note"
      rows={3}
      defaultValue="Our venue changed the event date and the new date is no longer available."
      disabled
    />
  </div>
);
