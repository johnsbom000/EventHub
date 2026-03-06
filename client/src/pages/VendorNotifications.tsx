import { useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import VendorShell from "@/components/VendorShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";

type VendorNotification = {
  id: string;
  title: string | null;
  message: string | null;
  link: string | null;
  read: boolean | null;
  createdAt: string | null;
  type?: string | null;
};

type VendorBooking = {
  id: string;
  status?: string | null;
  totalAmount?: number | null;
  platformFee?: number | null;
  vendorPayout?: number | null;
  createdAt?: string | null;
  eventDate?: string | null;
  eventStartTime?: string | null;
  eventLocation?: string | null;
  guestCount?: number | null;
  itemTitle?: string | null;
  customerEventTitle?: string | null;
  customerNotes?: string | null;
  customerQuestions?: string | null;
  listingDescription?: string | null;
  includedItems?: string[] | null;
  deliveryIncluded?: boolean | null;
  setupIncluded?: boolean | null;
};

function normalizeAmountToCents(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isInteger(n)) return Math.round(n * 100);
  if (n < 1000) return n * 100;
  return n;
}

function formatUsd(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function deriveBookingAmounts(booking: VendorBooking) {
  const customerTotalCents = normalizeAmountToCents(booking.totalAmount ?? 0);
  const vendorFeeCents = normalizeAmountToCents(booking.platformFee ?? 0);
  const storedPayoutCents = normalizeAmountToCents(booking.vendorPayout ?? 0);

  if (storedPayoutCents > 0 || vendorFeeCents > 0) {
    const listingPriceCents = Math.max(0, storedPayoutCents + vendorFeeCents);
    const customerFeeCents = Math.max(0, customerTotalCents - listingPriceCents);
    return {
      customerTotalCents,
      listingPriceCents,
      customerFeeCents,
      vendorFeeCents,
      estimatedPayoutCents:
        storedPayoutCents > 0
          ? storedPayoutCents
          : Math.max(0, listingPriceCents - vendorFeeCents),
    };
  }

  const listingPriceCents = Math.max(0, Math.round(customerTotalCents / 1.05));
  const customerFeeCents = Math.max(0, customerTotalCents - listingPriceCents);
  const derivedVendorFeeCents = Math.max(0, Math.round(listingPriceCents * 0.08));
  const estimatedPayoutCents = Math.max(0, listingPriceCents - derivedVendorFeeCents);

  return {
    customerTotalCents,
    listingPriceCents,
    customerFeeCents,
    vendorFeeCents: derivedVendorFeeCents,
    estimatedPayoutCents,
  };
}

function isBookingNotificationType(type: string | null | undefined) {
  return [
    "new_booking",
    "booking_confirmed",
    "booking_cancelled",
    "booking_rescheduled",
  ].includes(String(type || "").trim());
}

function extractBookingIdFromLink(link: string | null | undefined) {
  if (typeof link !== "string" || link.trim().length === 0) return null;

  try {
    const parsed = new URL(link, "https://eventhub.local");
    const bookingId = parsed.searchParams.get("bookingId");
    return bookingId && bookingId.trim().length > 0 ? bookingId.trim() : null;
  } catch {
    return null;
  }
}

function extractEventDateFromMessage(message: string | null | undefined) {
  if (typeof message !== "string") return null;
  const match = message.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return match?.[0] ?? null;
}

function resolveBookingForNotification(
  notification: VendorNotification,
  bookings: VendorBooking[],
) {
  const bookingId = extractBookingIdFromLink(notification.link);
  if (bookingId) {
    return bookings.find((booking) => booking.id === bookingId) ?? null;
  }

  const eventDate = extractEventDateFromMessage(notification.message);
  if (!eventDate) return null;

  const candidates = bookings.filter((booking) => booking.eventDate === eventDate);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const notificationTime = notification.createdAt ? new Date(notification.createdAt).getTime() : Number.NaN;
  if (!Number.isFinite(notificationTime)) {
    return candidates[0];
  }

  return [...candidates].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : notificationTime;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : notificationTime;
    return Math.abs(aTime - notificationTime) - Math.abs(bTime - notificationTime);
  })[0];
}

function formatStatusLabel(status: string | null | undefined) {
  const normalized = String(status || "").trim();
  if (!normalized) return "Unknown";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatDateLabel(dateString: string | null | undefined, timeString?: string | null) {
  if (!dateString) return "Not set";
  const parsed = new Date(`${dateString}T${timeString || "00:00:00"}`);
  if (Number.isNaN(parsed.getTime())) return dateString;

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeLabel(dateString: string | null | undefined, timeString?: string | null) {
  if (!dateString || !timeString) return "Not set";
  const parsed = new Date(`${dateString}T${timeString}`);
  if (Number.isNaN(parsed.getTime())) return timeString;

  return parsed.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function VendorNotifications() {
  const { isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();
  const [activeBookingNotificationId, setActiveBookingNotificationId] = useState<string | null>(null);

  const { data: notifications = [], isLoading } = useQuery<VendorNotification[]>({
    queryKey: ["/api/vendor/notifications"],
    enabled: isAuthenticated,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<VendorBooking[]>({
    queryKey: ["/api/vendor/bookings"],
    enabled: isAuthenticated,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/vendor/notifications/${id}/read`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/notifications"] });
    },
  });

  const resolvedNotifications = useMemo(
    () =>
      notifications.map((notification) => {
        const isBookingRelated = isBookingNotificationType(notification.type);
        const booking = isBookingRelated
          ? resolveBookingForNotification(notification, bookings)
          : null;
        const normalizedTitle =
          notification.type === "new_booking" && booking?.itemTitle
            ? `New booking for ${booking.itemTitle}`
            : notification.title;

        return {
          ...notification,
          title: normalizedTitle,
          isBookingRelated,
          booking,
        };
      }),
    [bookings, notifications],
  );

  const activeBookingNotification = useMemo(
    () =>
      resolvedNotifications.find(
        (notification) => notification.id === activeBookingNotificationId,
      ) ?? null,
    [activeBookingNotificationId, resolvedNotifications],
  );

  const activeBooking = activeBookingNotification?.booking ?? null;
  const activeBookingAmounts = activeBooking ? deriveBookingAmounts(activeBooking) : null;
  const activeIncludedItems = Array.isArray(activeBooking?.includedItems)
    ? activeBooking.includedItems.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  const handleMarkRead = (notificationId: string) => {
    markRead.mutate(notificationId);
  };

  const handleOpenBookingDetails = (notificationId: string) => {
    const notification = resolvedNotifications.find((entry) => entry.id === notificationId);
    if (!notification?.booking) return;

    if (notification.read === false || notification.read === null) {
      markRead.mutate(notification.id);
    }

    setActiveBookingNotificationId(notificationId);
  };

  return (
    <VendorShell>
      <Dialog
        open={Boolean(activeBooking)}
        onOpenChange={(open) => {
          if (!open) setActiveBookingNotificationId(null);
        }}
      >
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
              Notifications
            </h1>
            <p className="text-muted-foreground">
              Manage your notification preferences and alerts
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Notifications</CardTitle>
              <CardDescription>Your latest alerts and updates</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading...</div>
              ) : resolvedNotifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No notifications</h3>
                  <p className="text-muted-foreground">
                    You&apos;re all caught up! Notifications will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resolvedNotifications.map((notification) => {
                    const created = notification.createdAt ? new Date(notification.createdAt) : null;
                    const timeLabel = created
                      ? created.toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "";
                    const isUnread = notification.read === false || notification.read === null;

                    return (
                      <div
                        key={notification.id}
                        className={`w-full rounded-lg border p-4 ${
                          isUnread ? "bg-muted/30" : "bg-background"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-2 w-2 rounded-full ${
                                  isUnread ? "bg-primary" : "bg-transparent"
                                }`}
                              />
                              <div className="font-medium truncate">
                                {notification.title || "Notification"}
                              </div>
                            </div>
                            {notification.message ? (
                              <div
                                className={`text-sm text-muted-foreground mt-1 ${
                                  notification.isBookingRelated
                                    ? ""
                                    : "whitespace-pre-wrap"
                                }`}
                              >
                                {notification.message}
                              </div>
                            ) : null}
                          </div>

                          <div className="shrink-0 text-xs text-muted-foreground">
                            {timeLabel}
                          </div>
                        </div>

                        {(isUnread || notification.isBookingRelated) && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {isUnread ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleMarkRead(notification.id)}
                                disabled={markRead.isPending}
                              >
                                Mark as read
                              </Button>
                            ) : null}

                            {notification.isBookingRelated ? (
                              notification.booking ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenBookingDetails(notification.id)}
                                  data-testid={`button-open-booking-notification-${notification.id}`}
                                >
                                  View booking details
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {bookingsLoading
                                    ? "Loading booking details..."
                                    : "Booking details unavailable"}
                                </span>
                              )
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what alerts you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="new-bookings">New Bookings</Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when customers book your services
                  </p>
                </div>
                <Switch
                  id="new-bookings"
                  defaultChecked
                  data-testid="switch-new-bookings"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="reschedules">Reschedule Requests</Label>
                  <p className="text-sm text-muted-foreground">
                    When customers request to change event dates
                  </p>
                </div>
                <Switch
                  id="reschedules"
                  defaultChecked
                  data-testid="switch-reschedules"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="cancellations">Cancellations</Label>
                  <p className="text-sm text-muted-foreground">
                    Alert when bookings are cancelled
                  </p>
                </div>
                <Switch
                  id="cancellations"
                  defaultChecked
                  data-testid="switch-cancellations"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="payments">Payment Updates</Label>
                  <p className="text-sm text-muted-foreground">
                    Notifications about payment receipts and payouts
                  </p>
                </div>
                <Switch
                  id="payments"
                  defaultChecked
                  data-testid="switch-payments"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {activeBooking ? (
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {activeBookingNotification?.title || "Booking details"}
              </DialogTitle>
              <DialogDescription>
                Read-only booking summary for notification review.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Booking number
                </div>
                <div className="mt-1 font-medium">
                  #{activeBooking.id.slice(0, 8).toUpperCase()}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Status
                </div>
                <div className="mt-1 font-medium">
                  {formatStatusLabel(activeBooking.status)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Listing
                </div>
                <div className="mt-1 font-medium">
                  {activeBooking.itemTitle || "Listing"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Event
                </div>
                <div className="mt-1 font-medium">
                  {activeBooking.customerEventTitle || "Not set"}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Event date
                </div>
                <div className="mt-1 font-medium">
                  {formatDateLabel(activeBooking.eventDate, activeBooking.eventStartTime)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Event time
                </div>
                <div className="mt-1 font-medium">
                  {formatTimeLabel(activeBooking.eventDate, activeBooking.eventStartTime)}
                </div>
              </div>
              {activeBooking.eventLocation ? (
                <div className="rounded-lg border p-3 sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Event location
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.eventLocation}
                  </div>
                </div>
              ) : null}
              {typeof activeBooking.guestCount === "number" && activeBooking.guestCount > 0 ? (
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Guest count
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.guestCount}
                  </div>
                </div>
              ) : null}
            </div>

            {activeBookingAmounts ? (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Price details
                </div>
                <div className="text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Listing price</span>
                  <span>{formatUsd(activeBookingAmounts.listingPriceCents)}</span>
                </div>
                <div className="text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Customer service fee</span>
                  <span>{formatUsd(activeBookingAmounts.customerFeeCents)}</span>
                </div>
                <div className="text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Customer total</span>
                  <span>{formatUsd(activeBookingAmounts.customerTotalCents)}</span>
                </div>
                <div className="text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">EventHub fee</span>
                  <span>-{formatUsd(activeBookingAmounts.vendorFeeCents)}</span>
                </div>
                <div className="pt-1 text-sm font-medium flex items-center justify-between gap-3">
                  <span>Estimated payout</span>
                  <span>{formatUsd(activeBookingAmounts.estimatedPayoutCents)}</span>
                </div>
              </div>
            ) : null}

            {activeBooking.listingDescription ? (
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Description
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap">
                  {activeBooking.listingDescription}
                </div>
              </div>
            ) : null}

            {activeIncludedItems.length > 0 ? (
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  What&apos;s included
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeIncludedItems.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {activeBooking.deliveryIncluded !== null ? (
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Delivery
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.deliveryIncluded ? "Included" : "Not included"}
                  </div>
                </div>
              ) : null}
              {activeBooking.setupIncluded !== null ? (
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Setup
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.setupIncluded ? "Included" : "Not included"}
                  </div>
                </div>
              ) : null}
            </div>

            {activeBooking.customerNotes ? (
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Customer notes
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap">
                  {activeBooking.customerNotes}
                </div>
              </div>
            ) : null}

            {activeBooking.customerQuestions ? (
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Customer questions
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap">
                  {activeBooking.customerQuestions}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveBookingNotificationId(null)}
              >
                Close
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </VendorShell>
  );
}
