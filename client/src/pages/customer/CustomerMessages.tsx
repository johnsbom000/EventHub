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
      </div>

      <BookingChatWorkspace role="customer" />
    </div>
  );
}

