import { Avatar, AvatarImage, AvatarFallback } from "eventhub-ui";

export const HostAvatar = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <Avatar>
      <AvatarImage src="https://i.pravatar.cc/80?img=47" alt="Marisol Vega" />
      <AvatarFallback>MV</AvatarFallback>
    </Avatar>
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ fontWeight: 600, fontSize: 15 }}>Marisol Vega</div>
      <div style={{ fontSize: 13, opacity: 0.65 }}>Host · Salt Lake City, UT</div>
    </div>
  </div>
);

export const VendorAvatarSizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <Avatar className="h-8 w-8">
      <AvatarImage src="https://i.pravatar.cc/64?img=12" alt="Aspen Grove DJs" />
      <AvatarFallback style={{ fontSize: 11 }}>AG</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarImage src="https://i.pravatar.cc/80?img=5" alt="Copper Table Catering" />
      <AvatarFallback style={{ fontSize: 13 }}>CT</AvatarFallback>
    </Avatar>
    <Avatar className="h-14 w-14">
      <AvatarImage src="https://i.pravatar.cc/112?img=32" alt="Bella Fiori Florals" />
      <AvatarFallback style={{ fontSize: 18 }}>BF</AvatarFallback>
    </Avatar>
  </div>
);

export const StackedTeam = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ display: "flex" }}>
      <Avatar className="h-9 w-9" style={{ marginRight: -10, boxShadow: "0 0 0 2px white" }}>
        <AvatarImage src="https://i.pravatar.cc/72?img=15" alt="Jordan Pierce" />
        <AvatarFallback style={{ fontSize: 12 }}>JP</AvatarFallback>
      </Avatar>
      <Avatar className="h-9 w-9" style={{ marginRight: -10, boxShadow: "0 0 0 2px white" }}>
        <AvatarImage src="https://i.pravatar.cc/72?img=24" alt="Nadia Okafor" />
        <AvatarFallback style={{ fontSize: 12 }}>NO</AvatarFallback>
      </Avatar>
      <Avatar className="h-9 w-9" style={{ marginRight: -10, boxShadow: "0 0 0 2px white" }}>
        <AvatarImage src="https://i.pravatar.cc/72?img=8" alt="Theo Ramirez" />
        <AvatarFallback style={{ fontSize: 12 }}>TR</AvatarFallback>
      </Avatar>
      <Avatar className="h-9 w-9" style={{ boxShadow: "0 0 0 2px white" }}>
        <AvatarFallback style={{ fontSize: 11, fontWeight: 600 }}>+6</AvatarFallback>
      </Avatar>
    </div>
    <span style={{ fontSize: 13, opacity: 0.7 }}>9 vendors booked this venue</span>
  </div>
);
