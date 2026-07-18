import { TimeInput, Label } from "eventhub-ui";

export const EventStartTime = () => (
  <div style={{ display: "grid", gap: 6, width: 220 }}>
    <Label htmlFor="start-time">Event start time</Label>
    <TimeInput id="start-time" value="18:30" onChange={() => {}} />
  </div>
);

export const CeremonyAndReception = () => (
  <div style={{ display: "flex", gap: 24 }}>
    <div style={{ display: "grid", gap: 6, width: 180 }}>
      <Label htmlFor="ceremony-time">Ceremony</Label>
      <TimeInput id="ceremony-time" value="16:00" onChange={() => {}} />
    </div>
    <div style={{ display: "grid", gap: 6, width: 180 }}>
      <Label htmlFor="reception-time">Reception</Label>
      <TimeInput id="reception-time" value="19:00" onChange={() => {}} />
    </div>
  </div>
);

export const EmptyState = () => (
  <div style={{ display: "grid", gap: 6, width: 220 }}>
    <Label htmlFor="load-in-time">Vendor load-in time</Label>
    <TimeInput id="load-in-time" value="" onChange={() => {}} />
  </div>
);
