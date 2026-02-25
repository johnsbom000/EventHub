import { BookingChatWorkspace } from "@/features/chat/BookingChatWorkspace";

interface CustomerMessagesProps {
  customer: {
    id: string;
    name: string;
    email: string;
  };
}

export default function CustomerMessages(_props: CustomerMessagesProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-messages-title">
          Messages
        </h1>
        <p className="mt-1 text-muted-foreground">
          Chat with vendors for bookings after payment details are collected.
        </p>
      </div>

      <BookingChatWorkspace role="customer" />
    </div>
  );
}

