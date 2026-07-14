import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
  CommandSeparator,
} from "eventhub-ui";
import { CalendarPlus, MessageSquare, Store, Utensils, Flower2 } from "lucide-react";

// Inline command palette for searching vendors and quick actions.
export const VendorSearchPalette = () => (
  <div style={{ width: 480 }} className="rounded-xl border border-border shadow-sm">
    <Command>
      <CommandInput placeholder="Search vendors or actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Vendors">
          <CommandItem>
            <Flower2 />
            <span>Bella Fiori Florals</span>
          </CommandItem>
          <CommandItem>
            <Utensils />
            <span>Ivory Lane Catering</span>
          </CommandItem>
          <CommandItem>
            <Store />
            <span>Wasatch Rentals & Decor</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem>
            <CalendarPlus />
            <span>New booking</span>
          </CommandItem>
          <CommandItem>
            <MessageSquare />
            <span>Message host</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </div>
);
