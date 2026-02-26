import { cn } from "@/lib/utils";

interface BrandWordmarkProps {
  className?: string;
  eventClassName?: string;
  hubClassName?: string;
}

export default function BrandWordmark({
  className,
  eventClassName,
  hubClassName,
}: BrandWordmarkProps) {
  return (
    <span className={cn("inline-flex items-baseline leading-none tracking-tight [font-family:var(--font-logo)]", className)}>
      <span className={cn("font-normal text-inherit", eventClassName)}>Event</span>
      <span className={cn("font-normal text-inherit", hubClassName)}>Hub</span>
    </span>
  );
}
