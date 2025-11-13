import { useState } from "react";
import { ListingFormData } from "../types";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";

interface PhotosStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function PhotosStep({ formData, updateFormData, goNext, goBack }: PhotosStepProps) {
  const [photos, setPhotos] = useState<string[]>(formData.photos as string[] || []);

  const addPhoto = () => {
    const newPhoto = `https://via.placeholder.com/300x200?text=Photo+${photos.length + 1}`;
    setPhotos([...photos, newPhoto]);
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    updateFormData({ photos });
    goNext();
  };

  const canProceed = photos.length >= 15;

  return (
    <div className="max-w-5xl mx-auto p-8" data-testid="step-content-photos">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Add your photos</h2>
        <p className="text-muted-foreground">
          Upload at least 15 high-quality photos of your work
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {photos.length}/15 photos uploaded
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {photos.map((photo, index) => (
          <Card key={index} className="relative aspect-square overflow-hidden group">
            <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => removePhoto(index)}
              data-testid={`button-remove-photo-${index}`}
            >
              <X className="w-4 h-4" />
            </Button>
          </Card>
        ))}
        
        <Card
          onClick={addPhoto}
          className="aspect-square flex items-center justify-center cursor-pointer hover-elevate"
          data-testid="button-add-photo"
        >
          <div className="text-center">
            <Plus className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Add Photo</p>
          </div>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={goBack} data-testid="button-back">
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={goNext} data-testid="button-skip">
            Skip
          </Button>
          <Button onClick={handleNext} disabled={!canProceed} data-testid="button-next">
            Next {!canProceed && `(${15 - photos.length} more needed)`}
          </Button>
        </div>
      </div>
    </div>
  );
}
