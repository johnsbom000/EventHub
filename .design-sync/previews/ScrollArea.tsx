import { ScrollArea } from "eventhub-ui";

const messages = [
  { from: "Bella Fiori Florals", text: "We can do the peony arch for June 14 — sending a quote now.", time: "9:02 AM" },
  { from: "Copper Table Catering", text: "Tasting confirmed for Thursday at 4pm. Bringing three entrée options.", time: "Yesterday" },
  { from: "Aspen Grove DJs", text: "Do you want the ceremony PA system included in the package?", time: "Yesterday" },
  { from: "Marisol Vega", text: "The venue walkthrough is set for Saturday morning.", time: "Mon" },
  { from: "Peak & Pine Rentals", text: "40 gold chiavari chairs are reserved for your date.", time: "Mon" },
  { from: "Lumen Photo Co.", text: "Here's the shot list draft — let me know what to add.", time: "Sun" },
  { from: "Sweet Alpine Bakery", text: "Three-tier lemon elderflower cake, tasting box shipping today.", time: "Sun" },
];

export const MessageList = () => (
  <ScrollArea className="rounded-md border" style={{ height: 260, width: 340 }}>
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13, opacity: 0.6, padding: "0 4px 8px" }}>
        Recent messages
      </div>
      {messages.map((m, i) => (
        <div key={i} style={{ padding: "10px 4px", borderBottom: i < messages.length - 1 ? "1px solid hsl(var(--border))" : "none" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{m.from}</span>
            <span style={{ fontSize: 12, opacity: 0.55, whiteSpace: "nowrap" }}>{m.time}</span>
          </div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2, lineHeight: 1.4 }}>{m.text}</div>
        </div>
      ))}
    </div>
  </ScrollArea>
);

export const VendorPicker = () => (
  <ScrollArea className="rounded-md border" style={{ height: 220, width: 300 }}>
    <div style={{ padding: 8 }}>
      {[
        "Bella Fiori Florals — Florist",
        "Copper Table Catering — Catering",
        "Aspen Grove DJs — Music",
        "Lumen Photo Co. — Photography",
        "Peak & Pine Rentals — Rentals",
        "Sweet Alpine Bakery — Desserts",
        "Wasatch String Quartet — Live Music",
        "Golden Hour Lighting — Production",
        "Canyon Road Valet — Transportation",
      ].map((v, i) => (
        <div key={i} style={{ padding: "9px 10px", borderRadius: 8, fontSize: 14 }}>
          {v}
        </div>
      ))}
    </div>
  </ScrollArea>
);
