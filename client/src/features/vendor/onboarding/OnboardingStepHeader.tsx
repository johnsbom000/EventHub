import { cn } from "@/lib/utils";

interface OnboardingStepHeaderProps {
  currentStep: number;
  totalSteps?: number;
}

export default function OnboardingStepHeader({
  currentStep,
  totalSteps = 3,
}: OnboardingStepHeaderProps) {
  const safeTotal = Math.max(1, totalSteps);
  const safeCurrent = Math.min(Math.max(1, currentStep), safeTotal);
  const stepPalette = ["#4A6A7D", "#2A3A42", "#16222D"];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {Array.from({ length: safeTotal }).map((_, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber <= safeCurrent;
          const isConnectorComplete = stepNumber < safeCurrent;
          const isLast = index === safeTotal - 1;
          const stepColor = stepPalette[Math.min(index, stepPalette.length - 1)];
          const connectorColor = stepPalette[Math.min(index, stepPalette.length - 1)];

          return (
            <div key={stepNumber} className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  isComplete ? "" : "opacity-30"
                )}
                style={{ backgroundColor: stepColor }}
              />
              {!isLast ? (
                <span
                  className={cn(
                    "h-[2px] w-10 rounded-full",
                    isConnectorComplete ? "" : "opacity-30"
                  )}
                  style={{ backgroundColor: connectorColor }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="font-sans text-[0.95rem] font-semibold uppercase tracking-[0.16em] text-[#2A3A42]">
        {`Step ${safeCurrent} of ${safeTotal}`}
      </p>
    </div>
  );
}
