import { Slider, Label } from "eventhub-ui";

export const BudgetRange = () => (
  <div style={{ display: "grid", gap: 10, width: 360 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label>Budget range</Label>
      <span style={{ fontSize: 14, fontWeight: 600 }}>$1,000 – $4,000</span>
    </div>
    <Slider defaultValue={[1000, 4000]} min={0} max={8000} step={250} />
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.6 }}>
      <span>$0</span>
      <span>$8,000</span>
    </div>
  </div>
);

export const GuestCount = () => (
  <div style={{ display: "grid", gap: 10, width: 360 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label>Guest count</Label>
      <span style={{ fontSize: 14, fontWeight: 600 }}>140 guests</span>
    </div>
    <Slider defaultValue={[140]} min={10} max={400} step={10} />
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.6 }}>
      <span>10</span>
      <span>400</span>
    </div>
  </div>
);

export const SearchRadius = () => (
  <div style={{ display: "grid", gap: 10, width: 360 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <Label>Search radius from Salt Lake City</Label>
      <span style={{ fontSize: 14, fontWeight: 600 }}>25 mi</span>
    </div>
    <Slider defaultValue={[25]} min={5} max={100} step={5} />
  </div>
);
