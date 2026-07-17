import { Package, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ListingType } from "./wizardTypes";

interface ListingTypeOption {
  type: ListingType;
  icon: typeof Package;
  label: string;
  description: string;
  details: string[];
  /** Requires a Pro subscription to select. */
  proOnly?: boolean;
}

const LISTING_TYPE_OPTIONS: ListingTypeOption[] = [
  {
    type: "single",
    icon: Package,
    label: "Single Listing",
    description: "One listing with one price — the standard option for most vendors.",
    details: [
      "One flat price (per day or per hour)",
      "Optional add-ons can be attached",
      "Ideal for a single item or service",
    ],
  },
  {
    type: "package_container",
    icon: ShoppingBag,
    label: "Package Listing",
    description: "Multiple tiers (e.g. Silver / Gold / Platinum) inside one listing. Each package has its own price and inclusions.",
    details: [
      "1–5 named packages per listing",
      "Each package has its own price, inclusions, and logistics settings",
      'Browse cards show "Starting from $X"',
      "Choose dependent or independent availability",
    ],
  },
  {
    type: "addon",
    icon: Plus,
    label: "Add-on Listing",
    description: "A standalone bookable item that can also be offered as an optional upgrade on other listings.",
    details: [
      "Independently bookable",
      "Attachable to any of your other listings",
      "Appears in the A-la-carte section on your shop page",
      "Shared inventory pool across all attached listings",
    ],
    proOnly: true,
  },
];

interface ListingTypeSelectorProps {
  onSelect: (type: ListingType) => void;
  /** When false, Pro-only types render with a lock and route to the upgrade CTA. */
  isPro?: boolean;
}

export function ListingTypeSelector({ onSelect, isPro = false }: ListingTypeSelectorProps) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-3xl space-y-10">
        <header className="space-y-3 text-center">
          <h1 className="text-5xl font-semibold tracking-tight">What type of listing is this?</h1>
          <p className="text-base text-muted-foreground">
            Choose the listing type that best describes what you're offering. You can change this later.
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-3">
          {LISTING_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const locked = Boolean(option.proOnly) && !isPro;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => onSelect(option.type)}
                aria-disabled={locked}
                className="group relative flex flex-col items-start gap-4 rounded-2xl border border-border bg-background p-6 text-left shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {option.proOnly && (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3 w-3" />
                    Pro
                  </span>
                )}
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted group-hover:bg-primary/10 transition">
                  <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{option.label}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">{option.description}</p>
                </div>

                <ul className="space-y-1.5">
                  {option.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/50" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>

                {/* Styled as a button but rendered as a span — the whole card is
                    already a <button>, and nesting real buttons is invalid DOM. */}
                <span className={cn(buttonVariants(), "mt-auto w-full")}>
                  {locked ? "Upgrade to Pro" : `Choose ${option.label}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
