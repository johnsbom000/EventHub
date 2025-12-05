import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface BudgetRangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  className?: string;
}

export function BudgetRangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  className,
}: BudgetRangeSliderProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{formatCurrency(value[0])}</span>
        <span>{formatCurrency(value[1])}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={(value) => onChange(value as [number, number])}
        minStepsBetweenThumbs={1}
        className="w-full"
      />
    </div>
  );
}
