import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "eventhub-ui";

// Overlay component: rendered controlled-open so the portalled content is
// visible in the card without interaction. cardMode "single" in config.
export const ConfirmBooking = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Confirm your booking</DialogTitle>
        <DialogDescription>
          You're about to book Bella Fiori Florals for June 14, 2026. A 25% deposit
          of $212.50 is due now to secure the date.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline">Go back</Button>
        <Button>Pay deposit &amp; book</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
