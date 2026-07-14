import { Calendar } from "eventhub-ui";

// Single-date picker showing a booked event day in June 2026.
export const EventDatePicker = () => (
  <Calendar
    mode="single"
    selected={new Date(2026, 5, 14)}
    defaultMonth={new Date(2026, 5, 1)}
  />
);
