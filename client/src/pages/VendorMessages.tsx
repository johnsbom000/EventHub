import VendorShell from "@/components/VendorShell";
import { BookingChatWorkspace } from "@/features/chat/BookingChatWorkspace";

export default function VendorMessages() {
  return (
    <VendorShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-vendor-messages-title">
            Messages
          </h1>
          <p className="text-muted-foreground">
            Chat with customers for bookings after payment details are collected.
          </p>
        </div>

        <BookingChatWorkspace role="vendor" />
      </div>
    </VendorShell>
  );
}

