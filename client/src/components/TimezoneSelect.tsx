import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const TIMEZONE_OPTIONS = [
  { value: "America/New_York",    label: "Eastern Time (ET)" },
  { value: "America/Chicago",     label: "Central Time (CT)" },
  { value: "America/Denver",      label: "Mountain Time (MT)" },
  { value: "America/Phoenix",     label: "Mountain Time – Arizona (no DST)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage",   label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii Time (HT)" },
  { value: "America/Puerto_Rico", label: "Atlantic Time – Puerto Rico (AT)" },
  { value: "UTC",                 label: "UTC" },
  { value: "Europe/London",       label: "London (GMT/BST)" },
  { value: "Europe/Paris",        label: "Central European Time (CET)" },
  { value: "Asia/Tokyo",          label: "Japan Standard Time (JST)" },
  { value: "Australia/Sydney",    label: "Australian Eastern Time (AEST)" },
] as const;

export type TimezoneValue = (typeof TIMEZONE_OPTIONS)[number]["value"] | string;

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

interface TimezoneSelectProps {
  value: string;
  onChange: (tz: string) => void;
  id?: string;
  className?: string;
}

export function TimezoneSelect({ value, onChange, id, className }: TimezoneSelectProps) {
  const knownOption = TIMEZONE_OPTIONS.find((o) => o.value === value);
  const displayValue = knownOption ? value : value || undefined;

  return (
    <Select value={displayValue} onValueChange={onChange}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder="Select your timezone" />
      </SelectTrigger>
      <SelectContent>
        {TIMEZONE_OPTIONS.map((tz) => (
          <SelectItem key={tz.value} value={tz.value}>
            {tz.label}
          </SelectItem>
        ))}
        {/* Show the current value as an option even if not in the list */}
        {value && !knownOption && (
          <SelectItem value={value}>{value}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
