import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
  Input,
  Label,
} from "eventhub-ui";
import { Users, CalendarDays } from "lucide-react";

// Overlay rendered controlled-open so the portalled content shows in the card.
export const GuestCountPicker = () => (
  <Popover open>
    <PopoverTrigger asChild>
      <Button variant="outline">
        <Users className="mr-2 h-4 w-4" />
        120 guests
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start">
      <div className="space-y-3">
        <div>
          <h4 className="font-medium leading-none">Party size</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell vendors how many guests to plan for.
          </p>
        </div>
        <div className="grid grid-cols-3 items-center gap-3">
          <Label htmlFor="adults">Adults</Label>
          <Input id="adults" defaultValue="96" className="col-span-2 h-8" />
        </div>
        <div className="grid grid-cols-3 items-center gap-3">
          <Label htmlFor="kids">Children</Label>
          <Input id="kids" defaultValue="24" className="col-span-2 h-8" />
        </div>
        <Button className="w-full">Update headcount</Button>
      </div>
    </PopoverContent>
  </Popover>
);

export const DateRangePicker = () => (
  <Popover open>
    <PopoverTrigger asChild>
      <Button variant="outline">
        <CalendarDays className="mr-2 h-4 w-4" />
        Jun 12 – Jun 14, 2026
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start">
      <div className="space-y-3">
        <h4 className="font-medium leading-none">Availability window</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">Check-in</Label>
            <Input id="from" defaultValue="Jun 12, 2026" className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">Check-out</Label>
            <Input id="to" defaultValue="Jun 14, 2026" className="h-8" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Riverside Pavilion, Salt Lake City is open these dates.
        </p>
      </div>
    </PopoverContent>
  </Popover>
);
