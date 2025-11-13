import { useState } from "react";
import { ListingFormData, Offering } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { nanoid } from "nanoid";

interface OfferingDetailsStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function OfferingDetailsStep({ formData, updateFormData, goNext, goBack }: OfferingDetailsStepProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");

  const handleSave = () => {
    const newOffering: Offering = {
      id: nanoid(),
      title,
      description,
      price: parseFloat(price) || 0,
      duration: parseInt(duration) || 0,
    };

    updateFormData({ offerings: [...formData.offerings, newOffering] });
    goNext();
  };

  const canSave = title && description && price && duration;

  return (
    <div className="max-w-3xl mx-auto p-8" data-testid="step-content-offeringDetails">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Offering details</h2>
        <p className="text-muted-foreground">
          Create a package or service offering for customers to book
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <Label>Offering Photo</Label>
          <Card className="w-full h-48 flex items-center justify-center cursor-pointer hover-elevate" data-testid="button-upload-photo">
            <div className="text-center">
              <Plus className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Upload photo</p>
            </div>
          </Card>
        </div>

        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Basic Package"
            data-testid="input-title"
          />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what's included in this offering..."
            rows={4}
            data-testid="textarea-description"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Price ($)</Label>
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              data-testid="input-price"
            />
          </div>

          <div>
            <Label>Duration (hours)</Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="0"
              min="0"
              data-testid="input-duration"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <Button onClick={handleSave} disabled={!canSave} data-testid="button-save-offering">
          Save Offering
        </Button>
      </div>
    </div>
  );
}
