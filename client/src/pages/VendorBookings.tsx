import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import VendorShell from "@/components/VendorShell";

type VendorBooking = {
  id: string;
  status?: string | null;
  totalAmount?: number | null;
  createdAt?: string | null;
  eventDate?: string | null;
  eventStartTime?: string | null;
};

type TabKey = "all" | "upcoming" | "pending" | "completed" | "cancelled";

export default function VendorBookings() {
  const { isAuthenticated } = useAuth0();

  const { data: bookings = [], isLoading } = useQuery<VendorBooking[]>({
    queryKey: ["/api/vendor/bookings"],
    enabled: isAuthenticated,
  });

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  
    const summary = useMemo(() => {
      const now = new Date();

      const parsed = (bookings || [])
        .map((b) => {
          let d: Date | null = null;

          if (b?.eventDate) {
            if (b.eventStartTime) d = new Date(`${b.eventDate}T${b.eventStartTime}`);
            else d = new Date(`${b.eventDate}T00:00:00`);
          } else if (b?.createdAt) {
            d = new Date(b.createdAt);
          }

          if (!(d instanceof Date) || isNaN(d.getTime())) return null;

          return { date: d, amount: b.totalAmount ?? 0, raw: b };
        })
        .filter(Boolean) as Array<{ date: Date; amount: number; raw: VendorBooking }>;

      const upcoming = parsed
        .filter((x) => x.date >= now)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      const next = upcoming.length > 0 ? upcoming[0].date : null;
      const upcomingCount = upcoming.length;
      const upcomingRevenue = upcoming.reduce((acc, x) => acc + (x.amount || 0), 0);

      return { next, upcomingCount, upcomingRevenue };
    }, [bookings]);

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
    const now = new Date();
    const normalizeStatus = (s: any) => String(s || "").toLowerCase();

    const mapped = (bookings || [])
      .map((b) => {
        let date: Date | null = null;

        // Prefer real event date
        if (b?.eventDate) {
          // eventDate is stored as text (YYYY-MM-DD)
          if (b.eventStartTime) {
            date = new Date(`${b.eventDate}T${b.eventStartTime}`);
          } else {
            date = new Date(`${b.eventDate}T00:00:00`);
          }
        } else if (b?.createdAt) {
          // Fallback (should rarely be used)
          date = new Date(b.createdAt);
        }

        return {
          id: b.id,
          status: normalizeStatus(b.status),
          date: date,
          amount: b.totalAmount ?? null,
          raw: b,
        };
      })
      .filter((x) => x.date instanceof Date && !isNaN(x.date.getTime()));

    const filteredByTab = mapped.filter((x) => {
      if (activeTab === "all") return true;
      if (activeTab === "upcoming") return x.date! >= now; // placeholder until real event dates exist
      return x.status === activeTab; // pending/completed/cancelled
    });

    // Only keep items in the visible month
    return filteredByTab.filter((x) => x.date! >= startOfMonth && x.date! < endOfMonth);
  }, [bookings, activeTab, startOfMonth, endOfMonth]);

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
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Quick snapshot of what’s next.</CardDescription>
          </CardHeader>

          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Next event</div>
              <div className="mt-1 text-lg font-semibold">
                {summary.next
                  ? summary.next.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "No upcoming bookings"}
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Upcoming bookings</div>
              <div className="mt-1 text-lg font-semibold">{summary.upcomingCount}</div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-sm text-muted-foreground">Upcoming revenue</div>
              <div className="mt-1 text-lg font-semibold">
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "USD",
                }).format((summary.upcomingRevenue || 0) / 100)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Calendar</CardTitle>
              <CardDescription>Month view. Tabs filter which bookings appear.</CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={goPrevMonth} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-[170px] text-center font-medium">{monthLabel}</div>

              <Button variant="outline" onClick={goNextMonth} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
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
                                {it.amount != null ? ` — $${it.amount}` : ""}
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
            )}
          </CardContent>
        </Card>
      </div>
    </VendorShell>
  );
}
