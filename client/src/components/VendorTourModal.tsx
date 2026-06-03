import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import type { TourStep } from "@/lib/vendorTourContent";

type VendorTourModalProps = {
  steps: TourStep[];
  onDismiss: () => void;
};

function injectHighlightStyles() {
  if (document.getElementById("tour-highlight-style")) return;
  const style = document.createElement("style");
  style.id = "tour-highlight-style";
  style.textContent = `
    .tour-highlight-active {
      outline: 2.5px solid rgba(74,106,125,0.9) !important;
      outline-offset: 6px !important;
      border-radius: 14px !important;
      animation: tourPulse 2s ease-in-out infinite !important;
      position: relative !important;
      z-index: 100 !important;
    }
    @keyframes tourPulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(74,106,125,0.18); }
      50%       { box-shadow: 0 0 0 8px rgba(74,106,125,0.08); }
    }
  `;
  document.head.appendChild(style);
}

export default function VendorTourModal({ steps, onDismiss }: VendorTourModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [, setLocation] = useLocation();

  const currentStep = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const hasMultipleSteps = steps.length > 1;
  const hasNextUp = Boolean(currentStep.nextUp);
  const hasPrimaryBtn = Boolean(currentStep.primaryBtn);

  // Apply pulsing ring to the highlighted element for this step
  useEffect(() => {
    injectHighlightStyles();

    const selector = currentStep.highlightSelector;
    if (!selector) return;

    const el = document.querySelector(selector);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    if (!isVisible) return;

    el.classList.add("tour-highlight-active");
    return () => el.classList.remove("tour-highlight-active");
  }, [currentStep.highlightSelector]);

  const handleNext = () => {
    if (!isLast) setStepIndex((i) => i + 1);
  };

  const handleNextUp = () => {
    if (!currentStep.nextUp) return;
    const href = currentStep.nextUp.href;
    onDismiss();
    setLocation(href);
  };

  return (
    <div className="fixed bottom-4 left-3 right-3 z-[90] rounded-[20px] bg-[#ffffff] shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-[rgba(74,106,125,0.18)] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[360px]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <span className="text-[1.2rem] font-semibold text-[#7c8095]">
          {hasMultipleSteps ? `${stepIndex + 1} of ${steps.length}` : "Quick tip"}
        </span>
        <button
          type="button"
          aria-label="Skip tour"
          onClick={onDismiss}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#9aacb4] transition-colors hover:bg-[rgba(74,106,125,0.1)] hover:text-[#4a6a7d]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-5 pt-3 pb-4">
        <h2 className="mb-2 font-sans text-[1.6rem] font-bold leading-snug text-[#20243d]">
          {currentStep.title}
        </h2>
        <p className="font-sans text-[1.35rem] leading-relaxed text-[#4a5568]">
          {currentStep.body}
        </p>
      </div>

      {/* Progress dots */}
      {hasMultipleSteps && (
        <div className="flex items-center justify-center gap-2 pb-3">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === stepIndex ? "w-5 bg-[#4a6a7d]" : "w-2 bg-[rgba(74,106,125,0.25)]"
              }`}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-[rgba(74,106,125,0.12)] px-5 py-4">
        {!isLast ? (
          <button
            type="button"
            onClick={handleNext}
            className="h-10 w-full rounded-[12px] bg-[#20243d] font-sans text-[1.35rem] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Next
          </button>
        ) : !hasPrimaryBtn && !hasNextUp ? (
          <p className="text-center font-sans text-[1.35rem] font-semibold text-[#4a6a7d]">
            You are all set!
          </p>
        ) : hasPrimaryBtn && hasNextUp ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleNextUp}
              className="h-10 w-full rounded-[12px] bg-[#20243d] font-sans text-[1.35rem] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {currentStep.nextUp!.label}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="h-10 w-full rounded-[12px] border-2 border-[rgba(74,106,125,0.3)] font-sans text-[1.35rem] font-semibold text-[#4a6a7d] transition-colors hover:border-[rgba(74,106,125,0.5)]"
            >
              {currentStep.primaryBtn}
            </button>
          </div>
        ) : hasNextUp ? (
          <button
            type="button"
            onClick={handleNextUp}
            className="h-10 w-full rounded-[12px] bg-[#20243d] font-sans text-[1.35rem] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {currentStep.nextUp!.label}
          </button>
        ) : (
          <button
            type="button"
            onClick={onDismiss}
            className="h-10 w-full rounded-[12px] bg-[#20243d] font-sans text-[1.35rem] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {currentStep.primaryBtn}
          </button>
        )}
      </div>
    </div>
  );
}
