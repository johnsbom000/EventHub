import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Building2,
  Camera,
  Video,
  Music2,
  UtensilsCrossed,
  Flower2,
  CakeSlice,
  Sparkles,
  Sofa,
} from "lucide-react";

type VendorTypeOption = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const VENDOR_TYPES: VendorTypeOption[] = [
  { id: "venue", label: "Venue", icon: Building2 },
  { id: "photographer", label: "Photographer", icon: Camera },
  { id: "videographer", label: "Videographer", icon: Video },
  { id: "dj", label: "DJ", icon: Music2 },
  { id: "catering", label: "Catering", icon: UtensilsCrossed },
  { id: "florist", label: "Florist", icon: Flower2 },
  { id: "baker_dessert", label: "Baker / Desserts", icon: CakeSlice },
  { id: "hair_makeup", label: "Hair & Makeup", icon: Sparkles },
  { id: "prop-decor", label: "Rental", icon: Sofa },
];

interface Step1VendorTypeProps {
  value: string;
  onChange: (vendorType: string) => void;
  onNext: () => void;
}

export default function Step1_VendorType({ value, onChange, onNext }: Step1VendorTypeProps) {
  const canContinue = Boolean(value);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">What service will you offer?</h1>
        <p className="text-sm text-muted-foreground">
          Select the type of service you want to list on Event Hub
        </p>
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {VENDOR_TYPES.map((opt) => {
          const selected = value === opt.id;
          const Icon = opt.icon;

          return (
            <Card
              key={opt.id}
              role="radio"
              aria-checked={selected}
              tabIndex={0}
              onClick={() => onChange(opt.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onChange(opt.id);
              }}
              className={cn(
                "cursor-pointer transition-all",
                "shadow-sm hover:shadow-md",
                selected
                    ? "border-[#9EDBC0] ring-2 ring-[#9EDBC0]/30 bg-[#9EDBC0]/10"
                    : "border-border bg-background"
              )}
              data-testid={`vendor-type-${opt.id}`}
            >
              <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-4">
                {/* Icon circle */}
                <div
                    className={cn(
                        "h-14 w-14 rounded-full flex items-center justify-center",
                        selected ? "bg-[#9EDBC0]/25" : "bg-muted"
                    )}
                >
                    <Icon className={cn("h-7 w-7", selected ? "text-[#2B7A67]" : "text-foreground/70")} />
                </div>


                <div className="text-sm font-medium">{opt.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button disabled={!canContinue} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
