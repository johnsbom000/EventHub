import { useState } from "react";
import { ListingFormData, Discount } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Clock, Calendar, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DiscountsStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

const DISCOUNT_CONFIG = {
  "limited-time": {
    label: "Limited-time Discount",
    description: "Offer a special promotional discount",
    icon: Clock,
  },
  "early-bird": {
    label: "Early Bird Discount",
    description: "Discount for booking in advance",
    icon: Calendar,
  },
  "large-group": {
    label: "Large Group Discount",
    description: "Discount for larger events",
    icon: Users,
  },
};

export function DiscountsStep({ formData, updateFormData, goNext, goBack }: DiscountsStepProps) {
  const [discounts, setDiscounts] = useState<Discount[]>(formData.discounts);
  const [editingDiscount, setEditingDiscount] = useState<Discount["type"] | null>(null);
  const [percentage, setPercentage] = useState(0);

  const openDiscountModal = (type: Discount["type"]) => {
    const existing = discounts.find(d => d.type === type);
    setPercentage(existing?.percentage || 0);
    setEditingDiscount(type);
  };

  const saveDiscount = () => {
    if (editingDiscount) {
      const updated = discounts.map(d =>
        d.type === editingDiscount
          ? { ...d, percentage, enabled: percentage > 0 }
          : d
      );
      setDiscounts(updated);
      setEditingDiscount(null);
    }
  };

  const handleNext = () => {
    updateFormData({ discounts });
    goNext();
  };

  return (
    <div className="max-w-3xl mx-auto p-8" data-testid="step-content-discounts">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Set up discounts (optional)</h2>
        <p className="text-muted-foreground">
          Offer discounts to attract more customers
        </p>
      </div>

      <div className="grid gap-4">
        {discounts.map((discount) => {
          const config = DISCOUNT_CONFIG[discount.type];
          const Icon = config.icon;

          return (
            <Card
              key={discount.type}
              onClick={() => openDiscountModal(discount.type)}
              className="p-6 cursor-pointer hover-elevate"
              data-testid={`card-${discount.type}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  discount.enabled ? "bg-primary text-white" : "bg-muted"
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{config.label}</h3>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  {discount.enabled && (
                    <p className="text-sm text-primary font-medium mt-1">
                      {discount.percentage}% discount active
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editingDiscount} onOpenChange={() => setEditingDiscount(null)}>
        <DialogContent data-testid="dialog-discount">
          <DialogHeader>
            <DialogTitle>
              {editingDiscount && DISCOUNT_CONFIG[editingDiscount].label}
            </DialogTitle>
            <DialogDescription>
              Enter the discount percentage (0-100)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              type="number"
              value={percentage}
              onChange={(e) => setPercentage(parseInt(e.target.value) || 0)}
              min="0"
              max="100"
              placeholder="Enter percentage"
              data-testid="input-percentage"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingDiscount(null)} data-testid="button-cancel">
                Cancel
              </Button>
              <Button onClick={saveDiscount} data-testid="button-save-discount">
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={goNext} data-testid="button-skip">
            Skip
          </Button>
          <Button onClick={handleNext} data-testid="button-next">
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
