import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, MapPin, Star } from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

interface CustomerEventsProps {
  customer: {
    id: string;
    name: string;
    email: string;
  };
}

type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

type CustomerBooking = {
  id: string;
  status: BookingStatus;
  paymentStatus: "pending" | "partial" | "paid" | "refunded";
  totalAmount: number;
  eventId?: string | null;
  eventTitle?: string | null;
  customerEventId?: string | null;
  customerEventTitle?: string | null;
  eventDate: string;
  eventStartTime?: string | null;
  eventLocation?: string | null;
  listingId?: string | null;
  itemTitle?: string | null;
  displayTitle?: string | null;
  vendorBusinessName?: string | null;
  reviewSubmitted?: boolean;
  reviewRating?: number | null;
  reviewBody?: string | null;
  createdAt: string;
};

type CustomerEventOption = {
  id: string;
  title: string;
  bookingCount?: number;
  lastUsedAt?: string | null;
};

type EventScope = "upcoming" | "completed";

const UPCOMING_STATUSES: BookingStatus[] = ["confirmed", "pending", "cancelled"];
const COMPLETED_STATUSES: BookingStatus[] = ["completed"];

function normalizeAmountToCents(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (Number.isInteger(value) && value >= 10_000) return value;
  return Math.round(value * 100);
}

function formatUsdFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(normalizeAmountToCents(cents) / 100);
}

function getBookingTitle(booking: CustomerBooking) {
  const listingTitle = typeof booking.itemTitle === "string" && booking.itemTitle.trim().length > 0
    ? booking.itemTitle.trim()
    : null;
  const vendorName = typeof booking.vendorBusinessName === "string" && booking.vendorBusinessName.trim().length > 0
    ? booking.vendorBusinessName.trim()
    : null;

  if (listingTitle && vendorName) {
    return `${listingTitle} from ${vendorName}`;
  }

  if (typeof booking.displayTitle === "string" && booking.displayTitle.trim().length > 0) {
    return booking.displayTitle.trim();
  }

  if (listingTitle) return listingTitle;
  if (vendorName) return vendorName;
  return "Vendor";
}

export default function CustomerEvents({ customer }: CustomerEventsProps) {
  const queryClient = useQueryClient();
  const { data: bookings = [], isLoading } = useQuery<CustomerBooking[]>({
    queryKey: ["/api/customer/bookings"],
    enabled: Boolean(customer?.id),
  });
  const { data: customerEvents = [] } = useQuery<CustomerEventOption[]>({
    queryKey: ["/api/customer/events"],
    enabled: Boolean(customer?.id),
  });

  const [eventScope, setEventScope] = useState<EventScope>("upcoming");
  const [targetEventByBooking, setTargetEventByBooking] = useState<Record<string, string>>({});
  const [newEventNameByBooking, setNewEventNameByBooking] = useState<Record<string, string>>({});
  const [actionErrorByBooking, setActionErrorByBooking] = useState<Record<string, string>>({});
  const [reviewOpenByBooking, setReviewOpenByBooking] = useState<Record<string, boolean>>({});
  const [reviewRatingByBooking, setReviewRatingByBooking] = useState<Record<string, number>>({});
  const [reviewBodyByBooking, setReviewBodyByBooking] = useState<Record<string, string>>({});
  const [reviewErrorByBooking, setReviewErrorByBooking] = useState<Record<string, string>>({});

  const scopedBookings = useMemo(() => {
    if (eventScope === "completed") {
      return bookings.filter((booking) => booking.status === "completed");
    }
    return bookings.filter((booking) => booking.status !== "completed");
  }, [bookings, eventScope]);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, { id: string; title: string; bookings: CustomerBooking[] }>();

    for (const booking of scopedBookings) {
      const resolvedEventId =
        (typeof booking.customerEventId === "string" && booking.customerEventId.trim().length > 0
          ? booking.customerEventId.trim()
          : null) ||
        (typeof booking.eventId === "string" && booking.eventId.trim().length > 0
          ? booking.eventId.trim()
          : null) ||
        "unassigned";
      const resolvedEventTitle =
        (typeof booking.customerEventTitle === "string" && booking.customerEventTitle.trim().length > 0
          ? booking.customerEventTitle.trim()
          : null) ||
        (typeof booking.eventTitle === "string" && booking.eventTitle.trim().length > 0
          ? booking.eventTitle.trim()
          : null) ||
        "Unassigned Event";

      const key = `${resolvedEventId}::${resolvedEventTitle}`;
      const existing = groups.get(key);
      if (existing) {
        existing.bookings.push(booking);
        continue;
      }

      groups.set(key, {
        id: resolvedEventId,
        title: resolvedEventTitle,
        bookings: [booking],
      });
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        bookings: [...group.bookings].sort(
          (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
        ),
      }))
      .sort((a, b) => {
        if (a.title === "Unassigned Event") return 1;
        if (b.title === "Unassigned Event") return -1;
        return a.title.localeCompare(b.title);
      });
  }, [scopedBookings]);

  const moveBookingMutation = useMutation({
    mutationFn: async (payload: { bookingId: string; customerEventId?: string; customerEventTitle?: string }) => {
      const res = await apiRequest("PATCH", `/api/customer/bookings/${payload.bookingId}/event`, payload);
      return res.json();
    },
    onSuccess: async (data: any, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/customer/bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/customer/events"] }),
      ]);

      const resolvedEventId =
        (typeof data?.customerEvent?.id === "string" && data.customerEvent.id.trim().length > 0
          ? data.customerEvent.id.trim()
          : null) ||
        variables.customerEventId ||
        "";

      setTargetEventByBooking((prev) => ({ ...prev, [variables.bookingId]: resolvedEventId }));
      setNewEventNameByBooking((prev) => ({ ...prev, [variables.bookingId]: "" }));
      setActionErrorByBooking((prev) => {
        const next = { ...prev };
        delete next[variables.bookingId];
        return next;
      });
    },
    onError: (error: unknown, variables) => {
      const message = error instanceof Error ? error.message : "Failed to change event";
      setActionErrorByBooking((prev) => ({ ...prev, [variables.bookingId]: message }));
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: async (payload: { bookingId: string; rating: number; body: string }) => {
      const res = await apiRequest("POST", `/api/customer/bookings/${payload.bookingId}/review`, {
        rating: payload.rating,
        body: payload.body.trim(),
      });
      return res.json();
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/customer/bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/listings/public"] }),
      ]);
      setReviewOpenByBooking((prev) => ({ ...prev, [variables.bookingId]: false }));
      setReviewRatingByBooking((prev) => ({ ...prev, [variables.bookingId]: 0 }));
      setReviewBodyByBooking((prev) => ({ ...prev, [variables.bookingId]: "" }));
      setReviewErrorByBooking((prev) => {
        const next = { ...prev };
        delete next[variables.bookingId];
        return next;
      });
    },
    onError: (error: unknown, variables) => {
      const message = error instanceof Error ? error.message : "Failed to submit review";
      setReviewErrorByBooking((prev) => ({ ...prev, [variables.bookingId]: message }));
    },
  });

  const statusesForScope = eventScope === "completed" ? COMPLETED_STATUSES : UPCOMING_STATUSES;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-events-title">
            My Events
          </h1>
          <p className="text-muted-foreground mt-1">Your bookings and requests in Event Hub.</p>
        </div>

        <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setEventScope("upcoming")}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              eventScope === "upcoming"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Upcoming Events
          </button>
          <button
            type="button"
            onClick={() => setEventScope("completed")}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              eventScope === "completed"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Completed Events
          </button>
        </div>
      </div>

      {isLoading ? (
        <Card className="rounded-xl shadow-sm">
          <CardContent className="py-10 text-center text-muted-foreground">Loading bookings...</CardContent>
        </Card>
      ) : groupedEvents.length === 0 ? (
        <Card className="rounded-xl shadow-sm">
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {eventScope === "completed" ? "No completed events yet" : "No upcoming events yet"}
            </h3>
            <p className="text-muted-foreground">
              {eventScope === "completed"
                ? "Completed bookings will appear here."
                : "Your booking requests will appear here after you click Book Now."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map((group) => (
            <div key={`${group.id}-${group.title}`} className="space-y-3">
              <h2 className="text-2xl font-semibold">{group.title}</h2>

              {(() => {
                const orderedBookings = statusesForScope.flatMap((status) =>
                  group.bookings.filter((booking) => booking.status === status),
                );
                if (orderedBookings.length === 0) return null;

                return (
                  <div key={`${group.id}-${group.title}-bookings`} className="space-y-3">
                    <div className="grid gap-4">
                      {orderedBookings.map((booking) => {
                        const selectedExistingEventId =
                          targetEventByBooking[booking.id] ||
                          (customerEvents.some((evt) => evt.id === booking.customerEventId)
                            ? booking.customerEventId || ""
                            : customerEvents.some((evt) => evt.id === booking.eventId)
                              ? booking.eventId || ""
                              : "");

                        return (
                          <Card key={booking.id} className="rounded-xl shadow-sm" data-testid={`booking-card-${booking.id}`}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between gap-3">
                                <CardTitle className="text-lg">{getBookingTitle(booking)}</CardTitle>
                                <Badge variant="outline" className="capitalize">
                                  {booking.status}
                                </Badge>
                              </div>
                            </CardHeader>

                            <CardContent className="space-y-3 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>{format(new Date(booking.eventDate), "MMMM d, yyyy")}</span>
                              </div>

                              {booking.eventStartTime ? (
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  <span>{booking.eventStartTime}</span>
                                </div>
                              ) : null}

                              {booking.eventLocation ? (
                                <div className="flex items-center gap-2">
                                  <MapPin className="h-4 w-4" />
                                  <span>{booking.eventLocation}</span>
                                </div>
                              ) : null}

                              <div className="text-foreground">
                                <span className="font-medium">{formatUsdFromCents(booking.totalAmount)}</span>
                              </div>

                              {booking.status === "completed" ? (
                                <div className="rounded-md border p-3 space-y-3">
                                  {booking.reviewSubmitted ? (
                                    <div className="text-sm font-semibold text-foreground">
                                      {(booking.itemTitle || "Listing")} + Review submitted
                                    </div>
                                  ) : (
                                    <>
                                      {!reviewOpenByBooking[booking.id] ? (
                                        <Button
                                          size="sm"
                                          type="button"
                                          onClick={() =>
                                            setReviewOpenByBooking((prev) => ({ ...prev, [booking.id]: true }))
                                          }
                                        >
                                          Write Review
                                        </Button>
                                      ) : (
                                        <div className="space-y-3">
                                          <div className="text-sm font-medium text-foreground">
                                            Rate {booking.itemTitle || "this listing"}
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((value) => {
                                              const selected = (reviewRatingByBooking[booking.id] || 0) >= value;
                                              return (
                                                <button
                                                  key={value}
                                                  type="button"
                                                  aria-label={`Rate ${value} stars`}
                                                  className="p-0.5"
                                                  onClick={() =>
                                                    setReviewRatingByBooking((prev) => ({
                                                      ...prev,
                                                      [booking.id]: value,
                                                    }))
                                                  }
                                                >
                                                  <Star
                                                    className={`h-5 w-5 ${
                                                      selected
                                                        ? "fill-yellow-400 text-yellow-500"
                                                        : "text-muted-foreground"
                                                    }`}
                                                  />
                                                </button>
                                              );
                                            })}
                                          </div>

                                          {(reviewRatingByBooking[booking.id] || 0) > 0 ? (
                                            <div className="space-y-2">
                                              <Textarea
                                                value={reviewBodyByBooking[booking.id] || ""}
                                                onChange={(e) =>
                                                  setReviewBodyByBooking((prev) => ({
                                                    ...prev,
                                                    [booking.id]: e.target.value,
                                                  }))
                                                }
                                                placeholder="Write your review"
                                                className="min-h-[100px]"
                                              />
                                              <div className="flex items-center gap-2">
                                                <Button
                                                  size="sm"
                                                  type="button"
                                                  disabled={
                                                    submitReviewMutation.isPending ||
                                                    !booking.listingId ||
                                                    (reviewBodyByBooking[booking.id] || "").trim().length < 4
                                                  }
                                                  onClick={() => {
                                                    if (!booking.listingId) return;
                                                    const rating = reviewRatingByBooking[booking.id] || 0;
                                                    const body = reviewBodyByBooking[booking.id] || "";
                                                    if (rating < 1 || body.trim().length < 4) return;
                                                    submitReviewMutation.mutate({
                                                      bookingId: booking.id,
                                                      rating,
                                                      body,
                                                    });
                                                  }}
                                                >
                                                  Submit Review
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  type="button"
                                                  variant="outline"
                                                  disabled={submitReviewMutation.isPending}
                                                  onClick={() =>
                                                    setReviewOpenByBooking((prev) => ({
                                                      ...prev,
                                                      [booking.id]: false,
                                                    }))
                                                  }
                                                >
                                                  Cancel
                                                </Button>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className="text-xs text-muted-foreground">
                                              Select a star rating to continue.
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {reviewErrorByBooking[booking.id] ? (
                                    <p className="text-xs text-red-600">{reviewErrorByBooking[booking.id]}</p>
                                  ) : null}
                                </div>
                              ) : null}

                              <div className="rounded-md border p-3 space-y-2">
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Change event</div>

                                {customerEvents.length > 0 ? (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <select
                                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                                      value={selectedExistingEventId}
                                      onChange={(e) =>
                                        setTargetEventByBooking((prev) => ({
                                          ...prev,
                                          [booking.id]: e.target.value,
                                        }))
                                      }
                                    >
                                      <option value="">Select an event</option>
                                      {customerEvents.map((evt) => (
                                        <option key={evt.id} value={evt.id}>
                                          {evt.title}
                                        </option>
                                      ))}
                                    </select>

                                    <Button
                                      size="sm"
                                      type="button"
                                      onClick={() => {
                                        if (!selectedExistingEventId) return;
                                        moveBookingMutation.mutate({
                                          bookingId: booking.id,
                                          customerEventId: selectedExistingEventId,
                                        });
                                      }}
                                      disabled={moveBookingMutation.isPending || !selectedExistingEventId}
                                    >
                                      Move
                                    </Button>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No events yet. Create your first event below.</p>
                                )}

                                <div className="space-y-2">
                                  <div className="text-xs font-medium text-foreground">Create New Event</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                      value={newEventNameByBooking[booking.id] || ""}
                                      onChange={(e) =>
                                        setNewEventNameByBooking((prev) => ({
                                          ...prev,
                                          [booking.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="Event name"
                                      className="h-9 w-[280px]"
                                    />
                                    <Button
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                      disabled={!newEventNameByBooking[booking.id]?.trim() || moveBookingMutation.isPending}
                                      onClick={() => {
                                        const customerEventTitle = newEventNameByBooking[booking.id]?.trim();
                                        if (!customerEventTitle) return;
                                        moveBookingMutation.mutate({
                                          bookingId: booking.id,
                                          customerEventTitle,
                                        });
                                      }}
                                    >
                                      Create New Event
                                    </Button>
                                  </div>
                                </div>

                                {actionErrorByBooking[booking.id] ? (
                                  <p className="text-xs text-red-600">{actionErrorByBooking[booking.id]}</p>
                                ) : null}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
