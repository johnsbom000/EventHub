import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Edit } from "lucide-react";

interface BookingPromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookNow: () => void;
  onMakeAdjustments: () => void;
}

export default function BookingPromptModal({
  open,
  onOpenChange,
  onBookNow,
  onMakeAdjustments,
}: BookingPromptModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-booking-prompt">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Welcome back!</DialogTitle>
          <DialogDescription>
            Would you like to make adjustments to your order or Book Now?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-4">
          <Button
            size="lg"
            onClick={() => {
              onBookNow();
              onOpenChange(false);
            }}
            data-testid="button-booking-prompt-book-now"
          >
            <Calendar className="h-5 w-5 mr-2" />
            Book Now
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              onMakeAdjustments();
              onOpenChange(false);
            }}
            data-testid="button-booking-prompt-adjust"
          >
            <Edit className="h-5 w-5 mr-2" />
            Make Adjustments
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
