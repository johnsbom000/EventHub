import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Star } from "lucide-react";
import { VendorOnboardingData } from "@/pages/VendorOnboarding";

interface Props {
  formData: VendorOnboardingData;
  updateFormData: (updates: Partial<VendorOnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step4_Portfolio({ formData, updateFormData, onNext, onBack }: Props) {
  // Safe defaults so TS + runtime never see undefined
  const portfolioImages = formData.portfolioImages ?? [];
  const coverImageIndex = formData.coverImageIndex ?? 0;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // In a real implementation, upload to cloud storage
    const newImages = Array.from(files).map((file) => URL.createObjectURL(file));

    updateFormData({
      portfolioImages: [...portfolioImages, ...newImages],
      // If no cover selected yet, default to first image
      coverImageIndex: portfolioImages.length === 0 ? 0 : coverImageIndex,
    });

    // Optional: allow uploading the same file again by resetting input
    e.target.value = "";
  };

  const setCoverImage = (index: number) => {
    updateFormData({ coverImageIndex: index });
  };

  const removeImage = (index: number) => {
    const newImages = portfolioImages.filter((_, i) => i !== index);

    // Adjust cover index if needed
    let nextCover = coverImageIndex;
    if (newImages.length === 0) {
      nextCover = 0;
    } else if (coverImageIndex === index) {
      // If you removed the cover image, set cover to first remaining
      nextCover = 0;
    } else if (coverImageIndex > index) {
      // If you removed an earlier image, shift cover index left by 1
      nextCover = coverImageIndex - 1;
    }

    updateFormData({
      portfolioImages: newImages,
      coverImageIndex: nextCover,
    });
  };

  return (
    <Card className="rounded-xl shadow-lg">
      <CardHeader>
        <CardTitle>Add portfolio items that showcase your work</CardTitle>
        <CardDescription>
          Upload your best work to attract customers. You can add listing-specific photos later.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {portfolioImages.map((image, index) => (
            <div
              key={index}
              className="relative aspect-square rounded-lg overflow-hidden border-2 border-border group"
              data-testid={`portfolio-image-${index}`}
            >
              <img src={image} alt={`Portfolio ${index + 1}`} className="w-full h-full object-cover" />

              {coverImageIndex === index && (
                <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Cover
                </div>
              )}

              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setCoverImage(index)}
                  data-testid={`button-set-cover-${index}`}
                >
                  Set as cover
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => removeImage(index)}
                  data-testid={`button-remove-${index}`}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}

          {/* Upload tile */}
          <label className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary transition-colors cursor-pointer flex flex-col items-center justify-center gap-2">
            <Plus className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Add photos</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              data-testid="input-upload-photos"
            />
          </label>
        </div>

        <div className="flex justify-between items-center pt-4">
          <div className="text-sm text-muted-foreground">
            <a href="#" className="text-primary hover:underline">
              Get tips
            </a>{" "}
            on creating a great portfolio
          </div>
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 my-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                We recommend adding portfolio pictures to increase your chances of getting booked. However, you can skip
                this step and add them later if needed.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-4">
          <Button type="button" variant="outline" onClick={onBack} data-testid="button-back">
            Back
          </Button>

          <div className="space-x-2">
            <Button type="button" variant="outline" onClick={onNext} data-testid="button-skip">
              Skip for now
            </Button>

            <Button onClick={onNext} data-testid="button-next" disabled={portfolioImages.length === 0}>
              {portfolioImages.length > 0 ? "Next" : "Upload at least one image"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}