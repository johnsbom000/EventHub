import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Camera, Music, Flower2, Utensils, Scissors, Palette, Video, Package } from "lucide-react";

const SERVICES = [
  { value: "catering", label: "Catering", icon: Utensils },
  { value: "hair-styling", label: "Hair Styling", icon: Scissors },
  { value: "makeup", label: "Makeup", icon: Palette },
  { value: "dj", label: "DJ", icon: Music },
  { value: "nails", label: "Nails", icon: Palette },
  { value: "florist", label: "Florist", icon: Flower2 },
  { value: "photography", label: "Photography", icon: Camera },
  { value: "videography", label: "Videography", icon: Video },
  { value: "prop-rental", label: "Prop Rental", icon: Package },
];

interface Props {
  selectedService: string;
  onSelect: (service: string) => void;
  onNext: () => void;
}

export default function Step1_ServiceSetup({ selectedService, onSelect, onNext }: Props) {
  return (
    <Card className="rounded-xl shadow-lg">
      <CardHeader>
        <CardTitle>Which service will you provide?</CardTitle>
        <CardDescription>Choose the main service you offer to get started</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <button
                key={service.value}
                onClick={() => onSelect(service.value)}
                className={`flex flex-col items-center gap-3 p-6 rounded-lg border-2 transition-all hover:shadow-md ${
                  selectedService === service.value
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary/50"
                }`}
                data-testid={`service-${service.value}`}
              >
                <Icon className="w-8 h-8 text-primary" />
                <span className="text-sm font-medium text-center">{service.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button
            onClick={onNext}
            disabled={!selectedService}
            data-testid="button-next"
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
