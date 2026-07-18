import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Button,
} from "eventhub-ui";
import {
  MoreHorizontal,
  MessageSquare,
  CalendarClock,
  CalendarPlus,
  XCircle,
} from "lucide-react";

// Menu forced open so the portalled content renders in the card.
export const BookingActions = () => (
  <DropdownMenu open>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="icon">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuLabel>Bella Fiori — Jun 14</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <MessageSquare className="mr-2 h-4 w-4" />
        Message host
      </DropdownMenuItem>
      <DropdownMenuItem>
        <CalendarClock className="mr-2 h-4 w-4" />
        Reschedule
      </DropdownMenuItem>
      <DropdownMenuItem>
        <CalendarPlus className="mr-2 h-4 w-4" />
        Add to calendar
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive focus:text-destructive">
        <XCircle className="mr-2 h-4 w-4" />
        Cancel booking
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
