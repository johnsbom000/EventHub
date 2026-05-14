import { useMemo } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import VendorShell from "@/components/VendorShell";
import { BookingChatWorkspace } from "@/features/chat/BookingChatWorkspace";

export default function VendorMessages() {
  const { t } = useTranslation();
  const searchString = useSearch();
  const initialBookingId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("bookingId") ?? undefined;
  }, [searchString]);

  return (
    <VendorShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-vendor-messages-title">
            {t("vendorMessages.pageTitle")}
          </h1>
        </div>

        <BookingChatWorkspace role="vendor" initialBookingId={initialBookingId} />
      </div>
    </VendorShell>
  );
}

