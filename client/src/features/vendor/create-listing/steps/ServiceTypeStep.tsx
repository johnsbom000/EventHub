import { ListingFormData } from "../types";
import { Card } from "@/components/ui/card";
import { Camera, Music, Flower2, UtensilsCrossed, Video, Home, Scissors, Sparkles, Package } from "lucide-react";

interface ServiceTypeStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
}

const SERVICE_TYPES = [
  { id: "catering", label: "Catering", icon: UtensilsCrossed },
  { id: "hair-styling", label: "Hair Styling", icon: Scissors },
  { id: "makeup", label: "Makeup", icon: Sparkles },
  { id: "dj", label: "DJ", icon: Music },
  { id: "nails", label: "Nails", icon: Sparkles },
  { id: "florist", label: "Florist", icon: Flower2 },
  { id: "photography", label: "Photography", icon: Camera },
  { id: "videography", label: "Videography", icon: Video },
  { id: "prop-rental", label: "Prop Rental", icon: Package },
];

export function ServiceTypeStep({ formData, updateFormData, goNext }: ServiceTypeStepProps) {
  const handleSelect = (serviceType: string) => {
    updateFormData({ serviceType });
    setTimeout(() => goNext(), 300);
  };

  return (
    <div className="max-w-4xl mx-auto p-8" data-testid="step-content-serviceType">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">What service will you offer?</h2>
        <p className="text-muted-foreground">
          Select the type of service you want to list on Event Hub
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {SERVICE_TYPES.map((service) => {
          const Icon = service.icon;
          const isSelected = formData.serviceType === service.id;

          return (
            <Card
              key={service.id}
              onClick={() => handleSelect(service.id)}
              className={`p-6 cursor-pointer hover-elevate active-elevate-2 transition-all ${
                isSelected ? "ring-2 ring-primary bg-primary/5" : ""
              }`}
              data-testid={`service-${service.id}`}
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  isSelected ? "bg-primary text-white" : "bg-muted"
                }`}>
                  <Icon className="w-8 h-8" />
                </div>
                <span className="font-medium">{service.label}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
