import { useState } from "react";
import { ListingFormData, BusinessHours } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, X } from "lucide-react";

interface BusinessHoursStepProps {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  goNext: () => void;
  goBack: () => void;
}

export function BusinessHoursStep({ formData, updateFormData, goNext, goBack }: BusinessHoursStepProps) {
  const [hours, setHours] = useState<BusinessHours[]>(formData.businessHours);

  const toggleDay = (index: number) => {
    const updated = [...hours];
    updated[index].enabled = !updated[index].enabled;
    if (updated[index].enabled && updated[index].timeRanges.length === 0) {
      updated[index].timeRanges = [{ start: "09:00", end: "17:00" }];
    }
    setHours(updated);
  };

  const updateTimeRange = (dayIndex: number, rangeIndex: number, field: "start" | "end", value: string) => {
    const updated = [...hours];
    updated[dayIndex].timeRanges[rangeIndex][field] = value;
    setHours(updated);
  };

  const addTimeRange = (dayIndex: number) => {
    const updated = [...hours];
    updated[dayIndex].timeRanges.push({ start: "09:00", end: "17:00" });
    setHours(updated);
  };

  const removeTimeRange = (dayIndex: number, rangeIndex: number) => {
    const updated = [...hours];
    updated[dayIndex].timeRanges = updated[dayIndex].timeRanges.filter((_, i) => i !== rangeIndex);
    setHours(updated);
  };

  const handleNext = () => {
    updateFormData({ businessHours: hours });
    goNext();
  };

  return (
    <div className="max-w-3xl mx-auto p-8" data-testid="step-content-businessHours">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Set your business hours</h2>
        <p className="text-muted-foreground">
          Let customers know when you're available
        </p>
      </div>

      <div className="space-y-4">
        {hours.map((day, dayIndex) => (
          <div key={day.day} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">{day.day}</Label>
              <Switch
                checked={day.enabled}
                onCheckedChange={() => toggleDay(dayIndex)}
                data-testid={`switch-${day.day.toLowerCase()}`}
              />
            </div>

            {day.enabled && (
              <div className="space-y-2 ml-4">
                {day.timeRanges.map((range, rangeIndex) => (
                  <div key={rangeIndex} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={range.start}
                      onChange={(e) => updateTimeRange(dayIndex, rangeIndex, "start", e.target.value)}
                      className="w-32"
                      data-testid={`input-start-${day.day.toLowerCase()}-${rangeIndex}`}
                    />
                    <span>to</span>
                    <Input
                      type="time"
                      value={range.end}
                      onChange={(e) => updateTimeRange(dayIndex, rangeIndex, "end", e.target.value)}
                      className="w-32"
                      data-testid={`input-end-${day.day.toLowerCase()}-${rangeIndex}`}
                    />
                    {day.timeRanges.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTimeRange(dayIndex, rangeIndex)}
                        data-testid={`button-remove-range-${day.day.toLowerCase()}-${rangeIndex}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addTimeRange(dayIndex)}
                  data-testid={`button-add-range-${day.day.toLowerCase()}`}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Hours
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

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
