import { Skeleton } from "eventhub-ui";

const cardSurface: React.CSSProperties = {
  background: "hsl(210 20% 93%)",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  padding: 16,
};

export const VendorCardLoading = () => (
  <div style={{ ...cardSurface, width: 340 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <Skeleton className="h-12 w-12 rounded-full" />
      <div style={{ flex: 1 }}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-24" />
      </div>
    </div>
    <Skeleton className="h-3 w-full" />
    <Skeleton className="mt-2 h-3 w-5/6" />
    <Skeleton className="mt-2 h-3 w-2/3" />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
      <Skeleton className="h-5 w-20" />
      <Skeleton className="h-9 w-32 rounded-md" />
    </div>
  </div>
);

export const ListRowsLoading = () => (
  <div style={{ ...cardSurface, width: 340, display: "flex", flexDirection: "column", gap: 14 }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Skeleton className="h-10 w-10 rounded-full" />
        <div style={{ flex: 1 }}>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>
    ))}
  </div>
);
