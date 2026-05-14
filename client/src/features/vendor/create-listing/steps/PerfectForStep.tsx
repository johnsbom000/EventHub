import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { POPULAR_FOR_OPTIONS } from "@/constants/eventTypes";
import type { ListingDraft } from "../wizardTypes";
import { POPULAR_FOR_EMOJI } from "../wizardTypes";

interface PerfectForStepProps {
  draft: ListingDraft;
  setDraft: React.Dispatch<React.SetStateAction<ListingDraft>>;
}

export function PerfectForStep({ draft, setDraft }: PerfectForStepProps) {
  const allPerfectForSelected = POPULAR_FOR_OPTIONS.every((o) => draft.popularFor.includes(o));

  function togglePerfectFor(option: string) {
    setDraft((prev) => ({
      ...prev,
      popularFor: prev.popularFor.includes(option)
        ? prev.popularFor.filter((o) => o !== option)
        : [...prev.popularFor, option],
    }));
  }

  function toggleSelectAllPerfectFor() {
    setDraft((prev) => ({
      ...prev,
      popularFor: allPerfectForSelected ? [] : [...POPULAR_FOR_OPTIONS],
    }));
  }

  return (
    <div className="mx-auto w-full max-w-[53rem] space-y-8">
      <header className="space-y-3">
        <h1 className="text-5xl font-semibold tracking-tight">Perfect For</h1>
        <p className="text-base text-muted-foreground">Choose the events this listing is best for.</p>
      </header>

      <Card className="space-y-5 border-0 p-6 shadow-none">
        <div className="flex flex-wrap justify-center gap-3">
          {POPULAR_FOR_OPTIONS.map((option) => {
            const selected = draft.popularFor.includes(option);
            const emoji = POPULAR_FOR_EMOJI[option] ?? "✨";
            return (
              <button
                key={option}
                type="button"
                onClick={() => togglePerfectFor(option)}
                className={[
                  "inline-flex items-center gap-[0.78rem] rounded-full border px-[1.95rem] py-[1.18rem] text-[1.56rem] font-medium leading-none transition",
                  selected
                    ? "border-[#E07A6A] bg-[#E07A6A] text-white hover:bg-[#E07A6A]"
                    : "border-[#4a6a7d] bg-background text-[#2a3a42] hover:bg-muted",
                ].join(" ")}
              >
                <span>{option}</span>
                <span aria-hidden="true">{emoji}</span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={toggleSelectAllPerfectFor}>
            {allPerfectForSelected ? "Clear all" : "Select all"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
