import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import VendorShell from "@/components/VendorShell";
import { apiRequest } from "@/lib/queryClient";

type VendorBooking = {
  id: string;
  status?: string | null;
  totalAmount?: number | null;
  platformFee?: number | null;
  vendorPayout?: number | null;
  createdAt?: string | null;
  eventDate?: string | null;
  eventStartTime?: string | null;
  itemTitle?: string | null;
  customerEventTitle?: string | null;
  customerNotes?: string | null;
  customerQuestions?: string | null;
};

type TabKey = "all" | "upcoming" | "pending" | "completed" | "cancelled";
type ViewMode = "calendar" | "list";

function normalizeAmountToCents(value: unknown) {
  const n = Number(value ?? 0);
  // Keep MVP behavior stable while repairing mixed legacy rows:
  // - new booking flow writes cents (usually >= 1,000)
  // - older rows may be whole dollars (e.g. 370)
  // - decimals are treated as dollars
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
      estimatedPayoutCents: storedPayoutCents > 0 ? storedPayoutCents : Math.max(0, listingPriceCents - vendorFeeCents),
    };
  }

  // Fallback if legacy row is missing fee/payout columns.
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

export default function VendorBookings() {
  const { isAuthenticated } = useAuth0();
  const queryClient = useQueryClient();

  const { data: bookings = [], isLoading } = useQuery<VendorBooking[]>({
    queryKey: ["/api/vendor/bookings"],
    enabled: isAuthenticated,
  });

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [actionBookingId, setActionBookingId] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);

  const bookingActionMutation = useMutation({
    mutationFn: async (payload: { id: string; status: "confirmed" | "completed" | "cancelled" }) => {
      const res = await apiRequest("PATCH", `/api/vendor/bookings/${payload.id}`, {
        status: payload.status,
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/bookings"] });
    },
    onSettled: () => {
      setActionBookingId(null);
    },
  });

  const parsedBookings = useMemo(() => {
    const normalizeStatus = (s: any) => String(s || "").toLowerCase();

    return (bookings || [])
      .map((b) => {
        let d: Date | null = null;

        if (b?.eventDate) {
          if (b.eventStartTime) d = new Date(`${b.eventDate}T${b.eventStartTime}`);
          else d = new Date(`${b.eventDate}T00:00:00`);
        } else if (b?.createdAt) {
          d = new Date(b.createdAt);
        }

        if (!(d instanceof Date) || isNaN(d.getTime())) return null;

        return {
          id: b.id,
          date: d,
          amount: normalizeAmountToCents(b.totalAmount ?? 0),
          ...deriveBookingAmounts(b),
          status: normalizeStatus(b.status),
          raw: b,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        date: Date;
        amount: number;
        customerTotalCents: number;
        listingPriceCents: number;
        customerFeeCents: number;
        vendorFeeCents: number;
        estimatedPayoutCents: number;
        status: string;
        raw: VendorBooking;
      }>;
  }, [bookings]);

  const tabFilteredItems = useMemo(() => {
    const now = new Date();
    const matchesTab = (x: { date: Date; status: string }) => {
      if (activeTab === "all") return true;
      if (activeTab === "upcoming") return x.date >= now && x.status === "confirmed";
      return x.status === activeTab;
    };

    return parsedBookings.filter(matchesTab);
  }, [parsedBookings, activeTab]);

  const summary = useMemo(() => {
    const fmtTitle = (tab: TabKey) => tab.charAt(0).toUpperCase() + tab.slice(1);
    const sortAsc = [...tabFilteredItems].sort((a, b) => a.date.getTime() - b.date.getTime());
    const sortDesc = [...tabFilteredItems].sort((a, b) => b.date.getTime() - a.date.getTime());
    const totalAmount = tabFilteredItems.reduce((acc, x) => acc + (x.amount || 0), 0);
    const first = sortAsc[0] ?? null;
    const last = sortDesc[0] ?? null;

    if (activeTab === "upcoming") {
      return {
        title: "Upcoming",
        subtitle: "Quick snapshot of what's next.",
        label1: "Next event",
        value1: first?.date ?? null,
        label2: "Upcoming bookings",
        value2: tabFilteredItems.length,
        label3: "Upcoming revenue",
        value3: totalAmount,
      };
    }

    if (activeTab === "pending") {
      return {
        title: "Pending",
        subtitle: "Booking requests awaiting your action.",
        label1: "Next pending event",
        value1: first?.date ?? null,
        label2: "Pending requests",
        value2: tabFilteredItems.length,
        label3: "Pending value",
        value3: totalAmount,
      };
    }

    if (activeTab === "completed") {
      return {
        title: "Completed",
        subtitle: "Finished jobs and realized revenue.",
        label1: "Last completed event",
        value1: last?.date ?? null,
        label2: "Completed bookings",
        value2: tabFilteredItems.length,
        label3: "Total revenue",
        value3: totalAmount,
      };
    }

    if (activeTab === "cancelled") {
      return {
        title: "Cancelled",
        subtitle: "Jobs that were cancelled.",
        label1: "Last cancelled event",
        value1: last?.date ?? null,
        label2: "Cancelled bookings",
        value2: tabFilteredItems.length,
        label3: "Cancelled value",
        value3: totalAmount,
      };
    }

    return {
      title: fmtTitle(activeTab),
      subtitle: "Snapshot across all bookings.",
      label1: "Most recent event",
      value1: last?.date ?? null,
      label2: "Total bookings",
      value2: tabFilteredItems.length,
      label3: "Total value",
      value3: totalAmount,
    };
  }, [activeTab, tabFilteredItems]);

  // Month being shown in the calendar (local time)
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const startOfMonth = useMemo(() => {
    const d = new Date(monthCursor);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [monthCursor]);

  const endOfMonth = useMemo(() => {
    const d = new Date(startOfMonth);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [startOfMonth]);

  // Convert bookings into calendar events (best-effort with current schema)
  // NOTE: Once we add real eventDate fields, swap this mapping to use them.
  const calendarItems = useMemo(() => {
    return tabFilteredItems.filter((x) => x.date >= startOfMonth && x.date < endOfMonth);
  }, [tabFilteredItems, startOfMonth, endOfMonth]);

  const listItems = useMemo(() => {
    const items = [...tabFilteredItems];
    if (activeTab === "upcoming") {
      items.sort((a, b) => a.date.getTime() - b.date.getTime());
    } else {
      items.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    return items;
  }, [tabFilteredItems, activeTab]);

  const monthLabel = useMemo(() => {
    return startOfMonth.toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [startOfMonth]);

  const daysGrid = useMemo(() => {
    // Build a 6-week grid starting on Sunday
    const first = new Date(startOfMonth);
    const dayOfWeek = first.getDay(); // 0=Sun
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - dayOfWeek);
    gridStart.setHours(0, 0, 0, 0);

    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [startOfMonth]);

  const itemsByDayKey = useMemo(() => {
    const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const map = new Map<string, typeof calendarItems>();
    for (const item of calendarItems) {
      const k = key(item.date!);
      const arr = map.get(k) ?? [];
      arr.push(item);
      map.set(k, arr);
    }
    return map;
  }, [calendarItems]);

  const goPrevMonth = () => {
    const d = new Date(monthCursor);
    d.setMonth(d.getMonth() - 1);
    setMonthCursor(d);
  };

  const goNextMonth = () => {
    const d = new Date(monthCursor);
    d.setMonth(d.getMonth() + 1);
    setMonthCursor(d);
  };

  return (
    <VendorShell>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Bookings & Jobs
          </h1>
          <p className="text-muted-foreground">
            View all bookings on a calendar and filter by status.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">
              All
            </TabsTrigger>
            <TabsTrigger value="upcoming" data-testid="tab-upcoming">
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              Completed
            </TabsTrigger>
            <TabsTrigger value="cancelled" data-testid="tab-cancelled">
              Cancelled
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle>{summary.title}</CardTitle>
            <CardDescription>{summary.subtitle}</CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">{summary.label1}</div>
              <div className="mt-1 text-lg font-semibold">
                {summary.value1 instanceof Date
                  ? summary.value1.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "No matching bookings"}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">{summary.label2}</div>
              <div className="mt-1 text-lg font-semibold">{summary.value2}</div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">{summary.label3}</div>
              <div className="mt-1 text-lg font-semibold">
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "USD",
                }).format((summary.value3 || 0) / 100)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>{viewMode === "calendar" ? "Calendar" : "List"}</CardTitle>
              <CardDescription>
                {viewMode === "calendar"
                  ? "Month view. Tabs filter which bookings appear."
                  : "List view. Tabs filter which bookings appear."}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "calendar" ? "default" : "outline"}
                onClick={() => setViewMode("calendar")}
              >
                Calendar view
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                onClick={() => setViewMode("list")}
              >
                List view
              </Button>
              {viewMode === "calendar" ? (
                <>
                  <Button variant="outline" onClick={goPrevMonth} aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="min-w-[170px] text-center font-medium">{monthLabel}</div>

                  <Button variant="outline" onClick={goNextMonth} aria-label="Next month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : viewMode === "calendar" ? (
              <>
                {/* Day-of-week header */}
                <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground mb-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="px-2 py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Month grid */}
                <div className="grid grid-cols-7 gap-2">
                  {daysGrid.map((day) => {
                    const inMonth = day.getMonth() === startOfMonth.getMonth();
                    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                    const items = itemsByDayKey.get(key) ?? [];

                    return (
                      <div
                        key={key}
                        className={[
                          "rounded-lg border min-h-[96px] p-2",
                          inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between">
                          <div className="text-sm font-medium">{day.getDate()}</div>
                          {items.length > 0 ? (
                            <div className="text-xs text-muted-foreground">{items.length}</div>
                          ) : null}
                        </div>

                        {items.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {items.slice(0, 3).map((it) => (
                              <div key={it.id} className="text-xs truncate">
                                • {it.status || "booking"}
                                {it.estimatedPayoutCents != null
                                  ? ` — ${formatUsd(it.estimatedPayoutCents)}`
                                  : ""}
                              </div>
                            ))}
                            {items.length > 3 ? (
                              <div className="text-xs text-muted-foreground">
                                +{items.length - 3} more
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* Empty state */}
                {calendarItems.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Calendar className="h-10 w-10 mx-auto mb-3 opacity-70" />
                    No bookings match this filter/month yet.
                  </div>
                ) : null}
              </>
            ) : listItems.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-70" />
                No bookings match this filter yet.
              </div>
            ) : (
              <div className="space-y-3">
                {listItems.map((item) => (
                  <div key={item.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{item.raw.itemTitle || `Booking #${item.id.slice(0, 8)}`}</div>
                      <div className="text-sm capitalize text-muted-foreground">{item.status || "unknown"}</div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {item.date.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    {item.raw.customerEventTitle ? (
                      <div className="mt-1 text-sm text-foreground font-medium">{item.raw.customerEventTitle}</div>
                    ) : null}
                    <div className="mt-1 text-sm">
                      <span className="text-muted-foreground">Estimated payout: </span>
                      <span className="font-medium">{formatUsd(item.estimatedPayoutCents || 0)}</span>
                    </div>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedBookingId(expandedBookingId === item.id ? null : item.id)}
                      >
                        {expandedBookingId === item.id ? "Hide details" : "View details"}
                      </Button>

                      {expandedBookingId === item.id ? (
                        <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-3">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Fee Breakdown</div>
                            <div className="text-sm flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Listing price</span>
                              <span>{formatUsd(item.listingPriceCents)}</span>
                            </div>
                            <div className="text-sm flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Customer service fee (5%)</span>
                              <span>{formatUsd(item.customerFeeCents)}</span>
                            </div>
                            <div className="text-sm flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Customer total</span>
                              <span>{formatUsd(item.customerTotalCents)}</span>
                            </div>
                            <div className="text-sm flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">EventHub fee (8%)</span>
                              <span>-{formatUsd(item.vendorFeeCents)}</span>
                            </div>
                            <div className="pt-1 text-sm font-medium flex items-center justify-between gap-3">
                              <span>Estimated payout</span>
                              <span>{formatUsd(item.estimatedPayoutCents)}</span>
                            </div>
                          </div>
                          {item.raw.customerNotes ? (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
                              <div className="text-sm">{item.raw.customerNotes}</div>
                            </div>
                          ) : null}
                          {item.raw.customerQuestions ? (
                            <div>
                              <div className="text-xs uppercase tracking-wide text-muted-foreground">Questions</div>
                              <div className="text-sm">{item.raw.customerQuestions}</div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {item.status === "pending" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setActionBookingId(item.id);
                            bookingActionMutation.mutate({ id: item.id, status: "confirmed" });
                          }}
                          disabled={bookingActionMutation.isPending}
                        >
                          {bookingActionMutation.isPending && actionBookingId === item.id
                            ? "Accepting..."
                            : "Accept"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionBookingId(item.id);
                            bookingActionMutation.mutate({ id: item.id, status: "cancelled" });
                          }}
                          disabled={bookingActionMutation.isPending}
                        >
                          {bookingActionMutation.isPending && actionBookingId === item.id
                            ? "Declining..."
                            : "Decline"}
                        </Button>
                      </div>
                    ) : null}
                    {activeTab === "upcoming" && item.status === "confirmed" ? (
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setActionBookingId(item.id);
                            bookingActionMutation.mutate({ id: item.id, status: "completed" });
                          }}
                          disabled={bookingActionMutation.isPending}
                        >
                          {bookingActionMutation.isPending && actionBookingId === item.id
                            ? "Completing..."
                            : "Completed"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActionBookingId(item.id);
                            bookingActionMutation.mutate({ id: item.id, status: "cancelled" });
                          }}
                          disabled={bookingActionMutation.isPending}
                        >
                          {bookingActionMutation.isPending && actionBookingId === item.id
                            ? "Declining..."
                            : "Decline"}
                        </Button>
                      </div>
                    ) : null}
                    {bookingActionMutation.isError && actionBookingId === item.id ? (
                      <div className="mt-2 text-sm text-destructive">
                        {bookingActionMutation.error instanceof Error
                          ? bookingActionMutation.error.message
                          : "Failed to update booking"}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </VendorShell>
  );
}
