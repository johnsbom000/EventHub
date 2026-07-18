import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "eventhub-ui";

// Select forced open so the portalled listbox renders in the card.
export const EventTypeSelect = () => (
  <Select open defaultValue="wedding">
    <SelectTrigger className="w-[220px]">
      <SelectValue placeholder="Choose event type" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Celebrations</SelectLabel>
        <SelectItem value="wedding">Wedding</SelectItem>
        <SelectItem value="birthday">Birthday party</SelectItem>
        <SelectItem value="anniversary">Anniversary</SelectItem>
        <SelectItem value="quinceanera">Quinceañera</SelectItem>
      </SelectGroup>
      <SelectGroup>
        <SelectLabel>Business</SelectLabel>
        <SelectItem value="corporate">Corporate event</SelectItem>
        <SelectItem value="conference">Conference</SelectItem>
        <SelectItem value="fundraiser">Fundraiser gala</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
);
