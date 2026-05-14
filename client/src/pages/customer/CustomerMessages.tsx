import { useTranslation } from "react-i18next";
import { BookingChatWorkspace } from "@/features/chat/BookingChatWorkspace";

interface CustomerMessagesProps {
  customer: {
    id: string;
    name: string;
    email: string;
  };
  initialBookingId?: string;
}

export default function CustomerMessages({ initialBookingId }: CustomerMessagesProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-messages-title">
          {t("customerMessages.pageTitle")}
        </h1>
      </div>

      <BookingChatWorkspace role="customer" initialBookingId={initialBookingId} />
    </div>
  );
}

