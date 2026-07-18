import { Separator } from "eventhub-ui";

export const MetaRow = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 20, fontSize: 14 }}>
    <span style={{ fontWeight: 600 }}>4.9 ★</span>
    <Separator orientation="vertical" />
    <span style={{ opacity: 0.75 }}>128 reviews</span>
    <Separator orientation="vertical" />
    <span style={{ opacity: 0.75 }}>Salt Lake City, UT</span>
  </div>
);

export const SectionDivider = () => (
  <div style={{ width: 320 }}>
    <div>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>Bella Fiori Florals</div>
      <div style={{ fontSize: 13, opacity: 0.7 }}>Wedding & event floral design</div>
    </div>
    <Separator className="my-4" />
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
      <span style={{ opacity: 0.7 }}>Starting price</span>
      <span style={{ fontWeight: 600 }}>From $850</span>
    </div>
    <Separator className="my-4" />
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
      <span style={{ opacity: 0.7 }}>Next available</span>
      <span style={{ fontWeight: 600 }}>June 14, 2026</span>
    </div>
  </div>
);
