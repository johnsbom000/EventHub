import { cn } from "@/lib/utils";

type SidebarCountBadgeProps = {
  count: number;
  className?: string;
};

export function SidebarCountBadge({ count, className }: SidebarCountBadgeProps) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute right-0 top-0 z-[100] flex h-5 min-w-5 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#e07a6a] px-1 text-center text-[10px] font-semibold leading-none text-white shadow-sm",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
