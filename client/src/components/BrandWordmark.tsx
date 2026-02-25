import { cn } from "@/lib/utils";

interface BrandWordmarkProps {
  className?: string;
}

export default function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span
      className={cn("inline-block text-primary leading-none", className)}
      style={{ fontFamily: "\"Damion\", cursive" }}
    >
      Event Hub
    </span>
  );
}
