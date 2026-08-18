import { useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell, CalendarClock, CheckSquare } from "lucide-react";
import { Link } from "wouter";

import VendorShell from "@/components/VendorShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFeeRates } from "@/hooks/useFeeRates";
import { deriveBookingAmounts } from "@/lib/bookingAmounts";

const FILTER_TAB_ACTIVE_CLASSNAME =
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:hover:bg-primary";

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

// ---------- filter config ----------

type FilterKey = "all" | "bookings" | "messages" | "payments" | "reviews" | "calendar";

const FILTER_TYPES: Record<FilterKey, string[]> = {
  all: [],
  bookings: [
    "new_booking",
    "booking_confirmed",
    "booking_cancelled",
    "booking_rescheduled",
    "travel_fee_proposed",
    "travel_fee_accepted",
    "travel_fee_declined",
  ],
  messages: ["new_message"],
  payments: ["payment_received", "payout_processed"],
  reviews: ["review_received"],
  calendar: [
    "google_calendar_booking_updated",
    "google_calendar_booking_deleted",
    "google_calendar_sync_error",
  ],
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  bookings: "Bookings",
  messages: "Messages",
  payments: "Payments",
  reviews: "Reviews",
  calendar: "Calendar",
};

// ---------- helpers ----------

function formatUsd(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function isBookingNotificationType(type: string | null | undefined) {
  return [
    "new_booking",
    "booking_confirmed",
    "booking_cancelled",
    "booking_rescheduled",
  ].includes(String(type || "").trim());
}

function isGoogleCalendarNotificationType(type: string | null | undefined) {
  return [
    "google_calendar_booking_updated",
    "google_calendar_booking_deleted",
    "google_calendar_sync_error",
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

// ---------- component ----------

export default function VendorNotifications() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const feeRates = useFeeRates();

  const [activeBookingNotificationId, setActiveBookingNotificationId] = useState<string | null>(null);
  const [readTab, setReadTab] = useState<"unread" | "read">("unread");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const NOTIFICATIONS_KEY = ["/api/vendor/notifications"];

  const { data: notifications = [], isLoading } = useQuery<VendorNotification[]>({
    queryKey: NOTIFICATIONS_KEY,
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
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const previous = queryClient.getQueryData<VendorNotification[]>(NOTIFICATIONS_KEY);
      queryClient.setQueryData<VendorNotification[]>(NOTIFICATIONS_KEY, (old = []) =>
        old.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
      }
      toast({
        title: "Couldn't mark as read",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  const bulkMarkRead = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("PATCH", "/api/vendor/notifications/bulk/read", { ids });
      return res.json();
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const previous = queryClient.getQueryData<VendorNotification[]>(NOTIFICATIONS_KEY);
      const idSet = new Set(ids);
      queryClient.setQueryData<VendorNotification[]>(NOTIFICATIONS_KEY, (old = []) =>
        old.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n)),
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
      }
      toast({ title: "Couldn't mark as read", variant: "destructive" });
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      toast({ title: "Marked as read" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  const bulkArchive = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("PATCH", "/api/vendor/notifications/bulk/archive", { ids });
      return res.json();
    },
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const previous = queryClient.getQueryData<VendorNotification[]>(NOTIFICATIONS_KEY);
      const idSet = new Set(ids);
      queryClient.setQueryData<VendorNotification[]>(NOTIFICATIONS_KEY, (old = []) =>
        old.filter((n) => !idSet.has(n.id)),
      );
      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_KEY, context.previous);
      }
      toast({ title: "Couldn't archive notifications", variant: "destructive" });
    },
    onSuccess: (_, ids) => {
      setSelectedIds(new Set());
      toast({ title: `${ids.length} notification${ids.length === 1 ? "" : "s"} archived` });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

  const resolvedNotifications = useMemo(
    () =>
      notifications.map((notification) => {
        const isBookingRelated = isBookingNotificationType(notification.type);
        const isGoogleCalendar = isGoogleCalendarNotificationType(notification.type);
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
          isGoogleCalendar,
          booking,
        };
      }),
    [bookings, notifications],
  );

  // Split into unread / read, then apply type filter
  const filterByType = (list: typeof resolvedNotifications) => {
    if (activeFilter === "all") return list;
    const allowed = FILTER_TYPES[activeFilter];
    return list.filter((n) => allowed.includes(String(n.type || "").trim()));
  };

  const unreadNotifications = filterByType(
    resolvedNotifications.filter((n) => n.read === false || n.read === null),
  );

  const readNotifications = filterByType(
    resolvedNotifications.filter((n) => n.read === true),
  );

  const visibleNotifications = readTab === "unread" ? unreadNotifications : readNotifications;

  const unreadTotal = resolvedNotifications.filter((n) => n.read === false || n.read === null).length;

  const allVisibleIds = visibleNotifications.map((n) => n.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = allVisibleIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = allVisibleIds.filter((id) => selectedIds.has(id)).length;
  const bulkIsPending = bulkMarkRead.isPending || bulkArchive.isPending;

  const activeBookingNotification = useMemo(
    () =>
      resolvedNotifications.find(
        (notification) => notification.id === activeBookingNotificationId,
      ) ?? null,
    [activeBookingNotificationId, resolvedNotifications],
  );

  const activeBooking = activeBookingNotification?.booking ?? null;
  const activeBookingAmounts =
    activeBooking && feeRates ? deriveBookingAmounts(activeBooking, feeRates.vendorFeeRate) : null;
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
              {t("vendorNotifications.pageTitle")}
            </h1>
          </div>

          {/* Unread / Read tab toggle */}
          <div className="flex items-center gap-1 border-b">
            <button
              type="button"
              onClick={() => { setReadTab("unread"); setSelectedIds(new Set()); }}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                readTab === "unread"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Unread
              {unreadTotal > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground leading-none">
                  {unreadTotal}
                </span>
              )}
              {readTab === "unread" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => { setReadTab("read"); setSelectedIds(new Set()); }}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                readTab === "read"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Read
              {readTab === "read" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          {/* Type filter tabs */}
          <Tabs value={activeFilter} onValueChange={(v) => { setActiveFilter(v as FilterKey); setSelectedIds(new Set()); }}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className={FILTER_TAB_ACTIVE_CLASSNAME}
                >
                  {FILTER_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Notification list */}
          <section className="px-1">
            <div>
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">{t("vendorNotifications.loading")}</div>
              ) : visibleNotifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {readTab === "unread" ? "All caught up" : "No read notifications"}
                  </h3>
                  <p className="text-muted-foreground">
                    {readTab === "unread"
                      ? activeFilter === "all"
                        ? "You have no unread notifications."
                        : `No unread ${FILTER_LABELS[activeFilter].toLowerCase()} notifications.`
                      : activeFilter === "all"
                        ? "Notifications you've read will appear here."
                        : `No read ${FILTER_LABELS[activeFilter].toLowerCase()} notifications.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Select-all / bulk action bar */}
                  <div className="flex items-center justify-between gap-3 py-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 accent-primary cursor-pointer"
                      />
                      {someSelected ? `${selectedCount} selected` : "Select all"}
                    </label>

                    {someSelected && (
                      <div className="flex items-center gap-2">
                        {readTab === "unread" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={bulkIsPending}
                            onClick={() => bulkMarkRead.mutate(Array.from(selectedIds).filter((id) => allVisibleIds.includes(id)))}
                          >
                            <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                            Mark as read
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={bulkIsPending}
                          onClick={() => bulkArchive.mutate(Array.from(selectedIds).filter((id) => allVisibleIds.includes(id)))}
                        >
                          Archive
                        </Button>
                      </div>
                    )}
                  </div>

                  {visibleNotifications.map((notification) => {
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
                    const isChecked = selectedIds.has(notification.id);

                    return (
                      <div
                        key={notification.id}
                        className={`w-full rounded-lg border p-4 transition-colors ${
                          isChecked
                            ? "bg-primary/5 border-primary/30"
                            : isUnread
                              ? "bg-muted/30"
                              : "bg-background"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectOne(notification.id)}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 accent-primary cursor-pointer"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`h-2 w-2 rounded-full shrink-0 ${
                                      isUnread ? "bg-primary" : "bg-transparent"
                                    }`}
                                  />
                                  {notification.isGoogleCalendar ? (
                                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : null}
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

                              <div className="shrink-0 text-sm text-muted-foreground">
                                {timeLabel}
                              </div>
                            </div>

                            {(isUnread || notification.isBookingRelated || notification.isGoogleCalendar) && (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                {isUnread ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleMarkRead(notification.id)}
                                    disabled={markRead.isPending}
                                  >
                                    {t("vendorNotifications.markAsRead")}
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
                                      {t("vendorNotifications.viewBookingDetails")}
                                    </Button>
                                  ) : (
                                    <span className="text-sm text-muted-foreground">
                                      {bookingsLoading
                                        ? t("vendorNotifications.loadingBookingDetails")
                                        : t("vendorNotifications.bookingDetailsUnavailable")}
                                    </span>
                                  )
                                ) : null}

                                {notification.isGoogleCalendar && notification.link ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    asChild
                                  >
                                    <Link href={notification.link}>{t("vendorNotifications.goToDashboard")}</Link>
                                  </Button>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        {activeBooking ? (
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {activeBookingNotification?.title || t("vendorNotifications.bookingDetailsTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("vendorNotifications.bookingDetailsDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.bookingNumber")}
                </div>
                <div className="mt-1 font-medium">
                  #{activeBooking.id.slice(0, 8).toUpperCase()}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.status")}
                </div>
                <div className="mt-1 font-medium">
                  {formatStatusLabel(activeBooking.status)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.listingLabel")}
                </div>
                <div className="mt-1 font-medium">
                  {activeBooking.itemTitle || t("vendorNotifications.listingLabel")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.event")}
                </div>
                <div className="mt-1 font-medium">
                  {activeBooking.customerEventTitle || t("vendorNotifications.notSet")}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.eventDate")}
                </div>
                <div className="mt-1 font-medium">
                  {formatDateLabel(activeBooking.eventDate, activeBooking.eventStartTime)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.eventTime")}
                </div>
                <div className="mt-1 font-medium">
                  {formatTimeLabel(activeBooking.eventDate, activeBooking.eventStartTime)}
                </div>
              </div>
              {activeBooking.eventLocation ? (
                <div className="rounded-lg border p-3 sm:col-span-2">
                  <div className="text-sm uppercase tracking-wide text-muted-foreground">
                    {t("vendorNotifications.eventLocation")}
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.eventLocation}
                  </div>
                </div>
              ) : null}
              {typeof activeBooking.guestCount === "number" && activeBooking.guestCount > 0 ? (
                <div className="rounded-lg border p-3">
                  <div className="text-sm uppercase tracking-wide text-muted-foreground">
                    {t("vendorNotifications.guestCount")}
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.guestCount}
                  </div>
                </div>
              ) : null}
            </div>

            {activeBookingAmounts ? (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.priceDetails")}
                </div>
                <div className="text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("vendorNotifications.listingPrice")}</span>
                  <span>{formatUsd(activeBookingAmounts.listingPriceCents)}</span>
                </div>
                {activeBookingAmounts.customerFeeCents > 0 ? (
                  <div className="text-sm flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{t("vendorNotifications.customerServiceFee")}</span>
                    <span>{formatUsd(activeBookingAmounts.customerFeeCents)}</span>
                  </div>
                ) : null}
                <div className="text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("vendorNotifications.customerTotal")}</span>
                  <span>{formatUsd(activeBookingAmounts.customerTotalCents)}</span>
                </div>
                <div className="text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("vendorNotifications.eventhubFee")}</span>
                  <span>-{formatUsd(activeBookingAmounts.vendorFeeCents)}</span>
                </div>
                <div className="pt-1 text-sm font-medium flex items-center justify-between gap-3">
                  <span>{t("vendorNotifications.estimatedPayout")}</span>
                  <span>{formatUsd(activeBookingAmounts.estimatedPayoutCents)}</span>
                </div>
              </div>
            ) : null}

            {activeBooking.listingDescription ? (
              <div className="rounded-lg border p-4">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.description")}
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap">
                  {activeBooking.listingDescription}
                </div>
              </div>
            ) : null}

            {activeIncludedItems.length > 0 ? (
              <div className="rounded-lg border p-4">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.whatsIncluded")}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeIncludedItems.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border px-2.5 py-1 text-sm text-muted-foreground"
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
                  <div className="text-sm uppercase tracking-wide text-muted-foreground">
                    {t("vendorNotifications.delivery")}
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.deliveryIncluded ? t("vendorNotifications.included") : t("vendorNotifications.notIncluded")}
                  </div>
                </div>
              ) : null}
              {activeBooking.setupIncluded !== null ? (
                <div className="rounded-lg border p-3">
                  <div className="text-sm uppercase tracking-wide text-muted-foreground">
                    {t("vendorNotifications.setup")}
                  </div>
                  <div className="mt-1 font-medium">
                    {activeBooking.setupIncluded ? t("vendorNotifications.included") : t("vendorNotifications.notIncluded")}
                  </div>
                </div>
              ) : null}
            </div>

            {activeBooking.customerNotes ? (
              <div className="rounded-lg border p-4">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.customerNotes")}
                </div>
                <div className="mt-2 text-sm whitespace-pre-wrap">
                  {activeBooking.customerNotes}
                </div>
              </div>
            ) : null}

            {activeBooking.customerQuestions ? (
              <div className="rounded-lg border p-4">
                <div className="text-sm uppercase tracking-wide text-muted-foreground">
                  {t("vendorNotifications.customerQuestions")}
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
                {t("vendorNotifications.close")}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </VendorShell>
  );
}
