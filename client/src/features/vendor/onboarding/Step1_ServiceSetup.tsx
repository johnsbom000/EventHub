import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Briefcase, Camera, Music, Flower2, Utensils, Scissors, Palette, Video, Package } from "lucide-react";
import { useState, useEffect } from "react";

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
  const [customService, setCustomService] = useState("");
  const isOtherSelected = selectedService === "other" || (selectedService && !SERVICES.find(s => s.value === selectedService));

  // Hydrate customService state from selectedService prop when component mounts or prop changes
  useEffect(() => {
    if (selectedService && selectedService.startsWith("other:")) {
      const customText = selectedService.substring(6); // Remove "other:" prefix
      setCustomService(customText);
    } else if (selectedService === "other") {
      setCustomService("");
    }
  }, [selectedService]);

  const handleOtherClick = () => {
    onSelect("other");
  };

  const handleCustomServiceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomService(value);
    if (value.trim()) {
      onSelect(`other:${value}`);
    } else {
      onSelect("other");
    }
  };

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

        <div
          onClick={handleOtherClick}
          className={`flex items-center gap-4 p-6 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md ${
            isOtherSelected
              ? "border-primary bg-accent"
              : "border-border hover:border-primary/50"
          }`}
          data-testid="service-other"
        >
          <div className="flex items-center gap-3 flex-1">
            <Briefcase className="w-8 h-8 text-primary flex-shrink-0" />
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Other - Please specify your service type"
                value={customService}
                onChange={handleCustomServiceChange}
                onClick={(e) => e.stopPropagation()}
                className={`border-0 focus-visible:ring-0 px-0 ${isOtherSelected ? "bg-accent" : "bg-background"}`}
                data-testid="input-custom-service"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={onNext}
            disabled={Boolean(!selectedService || (isOtherSelected && customService.trim().length === 0))}
            data-testid="button-next"
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
