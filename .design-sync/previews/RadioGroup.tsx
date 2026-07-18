import { RadioGroup, RadioGroupItem, Label } from "eventhub-ui";

export const PackageTier = () => (
  <RadioGroup defaultValue="signature" style={{ width: 360, gap: 12 }}>
    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Choose your package</div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <RadioGroupItem value="essential" id="pkg-essential" />
      <Label htmlFor="pkg-essential">Essential — $850 · 3 hours coverage</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <RadioGroupItem value="signature" id="pkg-signature" />
      <Label htmlFor="pkg-signature">Signature — $1,600 · 6 hours + second shooter</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <RadioGroupItem value="luxe" id="pkg-luxe" />
      <Label htmlFor="pkg-luxe">Luxe — $2,900 · full day + album</Label>
    </div>
  </RadioGroup>
);

export const PayoutSchedule = () => (
  <RadioGroup defaultValue="weekly" style={{ width: 320, gap: 12 }}>
    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Payout schedule</div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <RadioGroupItem value="daily" id="po-daily" />
      <Label htmlFor="po-daily">Daily</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <RadioGroupItem value="weekly" id="po-weekly" />
      <Label htmlFor="po-weekly">Weekly (every Friday)</Label>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <RadioGroupItem value="monthly" id="po-monthly" disabled />
      <Label htmlFor="po-monthly">Monthly (Pro plan only)</Label>
    </div>
  </RadioGroup>
);
