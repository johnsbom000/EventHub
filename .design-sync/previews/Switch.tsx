import { Switch, Label } from "eventhub-ui";

export const NotificationSettings = () => (
  <div style={{ display: "grid", gap: 16, width: 340 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label htmlFor="sw-email">Email reminders</Label>
      <Switch id="sw-email" defaultChecked />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label htmlFor="sw-sms">SMS alerts</Label>
      <Switch id="sw-sms" defaultChecked />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label htmlFor="sw-marketing">Promotional offers</Label>
      <Switch id="sw-marketing" />
    </div>
  </div>
);

export const InstantBooking = () => (
  <div style={{ display: "grid", gap: 16, width: 360 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
      <div>
        <Label htmlFor="sw-instant">Instant booking</Label>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7 }}>
          Let hosts book available dates without approval.
        </p>
      </div>
      <Switch id="sw-instant" defaultChecked />
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
      <div>
        <Label htmlFor="sw-vacation">Vacation mode</Label>
        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.7 }}>
          Hide your listing from search while you're away.
        </p>
      </div>
      <Switch id="sw-vacation" />
    </div>
  </div>
);
