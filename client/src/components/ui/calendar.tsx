import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 font-sans text-foreground", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row sm:gap-4",
        month: "space-y-4",
        caption: "relative flex items-center justify-center pt-1",
        caption_label: "text-sm font-semibold text-foreground",
        nav: "flex items-center gap-1",
        nav_button:
          "inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-border bg-background p-0 text-muted-foreground transition-colors hover:bg-[hsl(var(--secondary-accent)/0.18)] hover:text-[hsl(var(--secondary-accent))]",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "w-9 rounded-md text-[0.8rem] font-semibold text-muted-foreground",
        row: "mt-2 flex w-full",
        cell: "relative h-9 w-9 p-0 text-center text-sm [&:has([aria-selected].day-range-end)]:rounded-r-[10px] [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent/70 first:[&:has([aria-selected])]:rounded-l-[10px] last:[&:has([aria-selected])]:rounded-r-[10px] focus-within:relative focus-within:z-20",
        day: "inline-flex h-9 w-9 items-center justify-center rounded-[10px] p-0 text-sm font-medium text-foreground transition-colors hover:bg-[hsl(var(--secondary-accent)/0.14)] hover:text-[hsl(var(--secondary-accent))] aria-selected:opacity-100",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today:
          "border border-[hsl(var(--secondary-accent)/0.7)] bg-[hsl(var(--secondary-accent)/0.16)] text-[hsl(var(--secondary-accent))]",
        day_outside:
          "day-outside text-muted-foreground/70 aria-selected:bg-accent/40 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
