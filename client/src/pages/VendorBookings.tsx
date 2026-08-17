import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, ChevronLeft, ChevronRight, Clock, Globe, MapPin, MessageSquare, Sparkles, Lock } from "lucide-react";
import VendorShell from "@/components/VendorShell";
import { useUpgradeModal } from "@/components/UpgradeModal";
import { apiRequest, getApiErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFeeRates } from "@/hooks/useFeeRates";
import { normalizeAmountToCents, deriveBookingAmounts } from "@/lib/bookingAmounts";

type TravelFeeProposal = {
  id: string;
  bookingId: string;
  amountCents: number;
  reason: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  paymentScheduleId: string | null;
  proposedAt: string;
  respondedAt: string | null;
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
  eventEndTime?: string | null;
  itemTitle?: string | null;
  parentListingTitle?: string | null;
  customerName?: string | null;
  customerEventTitle?: string | null;
  customerNotes?: string | null;
  customerQuestions?: string | null;
  googleSyncStatus?: string | null;
  googleEventId?: string | null;
  googleCalendarId?: string | null;
  outsideServiceRadius?: boolean | null;
  eventLocation?: string | null;
  eventTimezone?: string | null;
  vendorTimezoneSnapshot?: string | null;
  instantBookSnapshot?: boolean | null;
  addOnItems?: Array<{ title: string; priceCents: number }>;
  travelFeeProposal?: { id: string; status: string; amountCents: number; reason?: string | null } | null;
};

type TabKey = "all" | "upcoming" | "pending" | "completed" | "cancelled";
type ViewMode = "calendar" | "list";
const STATUS_TAB_TRIGGER_ACTIVE_CLASSNAME =
  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=active]:hover:bg-primary";

function formatUsd(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function formatTimeString(time: string | null | undefined): string | null {
  if (!time) return null;
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr ?? "0", 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${displayHour}${displayMinute} ${period}`;
}

function isChatWindowOpen(eventDate: string | null | undefined): boolean {
  if (!eventDate) return true;
  const endOfDay = new Date(`${eventDate}T23:59:59.999Z`);
  if (Number.isNaN(endOfDay.getTime())) return true;
  return Date.now() <= endOfDay.getTime() + 48 * 60 * 60 * 1000;
}

// True once the event's end time has passed. Uses the same local-time parsing
// convention as the rest of this page (see parsedBookings) and mirrors the
// backend completion cutoff in server/routers/vendor.ts.
function isEventEnded(eventDate?: string | null, eventEndTime?: string | null): boolean {
  if (!eventDate) return false;
  const end = eventEndTime
    ? new Date(`${eventDate}T${eventEndTime}`)
    : new Date(`${eventDate}T23:59:59`);
  if (Number.isNaN(end.getTime())) return false;
  return Date.now() > end.getTime();
}

function getTzAbbr(tz: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? tz
    );
  } catch {
    return tz;
  }
}

function getTzName(tz: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "long" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? tz
    );
  } catch {
    return tz;
  }
}

function isTimezoneMismatch(eventTz: string | null | undefined, vendorTz: string | null | undefined): boolean {
  if (!eventTz || !vendorTz) return false;
  return eventTz !== vendorTz;
}

type VendorMe = {
  googleConnectionStatus?: string | null;
  canUseGoogleSync?: boolean | null;
};

export default function VendorBookings() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const upgrade = useUpgradeModal();
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const feeRates = useFeeRates();

  const { data: vendorAccount } = useQuery<VendorMe>({
    queryKey: ["/api/vendor/me"],
    enabled: isAuthenticated,
  });

  const isGoogleConnected =
    (vendorAccount?.googleConnectionStatus || "disconnected").toLowerCase() === "connected";

  const {
    data: bookings = [],
    error,
    isError,
    isLoading,
  } = useQuery<VendorBooking[]>({
    queryKey: ["/api/vendor/bookings"],
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [actionBookingId, setActionBookingId] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [isGoogleCalendarConnectLoading, setIsGoogleCalendarConnectLoading] = useState(false);

  // Travel fee proposal state
  const [proposalBookingId, setProposalBookingId] = useState<string | null>(null);
  const [proposalAmount, setProposalAmount] = useState("");
  const [proposalReason, setProposalReason] = useState("");
  const [proposalError, setProposalError] = useState<string | null>(null);

  // Archive confirmation modal state
  const [archiveModalBookingId, setArchiveModalBookingId] = useState<string | null>(null);

  // Cancellation reason modal state
  const [cancelModalBookingId, setCancelModalBookingId] = useState<string | null>(null);
  const [cancelReasonSelected, setCancelReasonSelected] = useState("");
  const [cancelReasonOther, setCancelReasonOther] = useState("");

  const VENDOR_CANCEL_REASONS = [
    "Event is outside my service area",
    "Scheduling conflict",
    "Unable to fulfill the requirements",
    "Emergency / force majeure",
    "Other",
  ] as const;

  // Handle ?google_calendar=connected|error after OAuth callback redirect
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleCalendarParam = params.get("google_calendar");
    if (!googleCalendarParam) return;

    params.delete("google_calendar");
    const newSearch = params.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "");
    window.history.replaceState(null, "", newUrl);

    if (googleCalendarParam === "connected") {
      toast({
        title: t("vendorBookings.calendarConnectedToast"),
        description: "Your Google Calendar has been successfully linked.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/me"] });
    } else if (googleCalendarParam === "error") {
      toast({
        title: t("vendorBookings.calendarError"),
        description: "Something went wrong connecting your calendar. Please try again.",
        variant: "destructive",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bookingActionMutation = useMutation({
    mutationFn: async (payload: { id: string; status: "confirmed" | "completed" | "cancelled"; cancellationReason?: string }) => {
      const res = await apiRequest("PATCH", `/api/vendor/bookings/${payload.id}`, {
        status: payload.status,
        ...(payload.cancellationReason ? { cancellationReason: payload.cancellationReason } : {}),
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/bookings"] });
    },
    onSettled: () => {
      setActionBookingId(null);
      setCancelModalBookingId(null);
      setCancelReasonSelected("");
      setCancelReasonOther("");
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiRequest("DELETE", `/api/vendor/bookings/${bookingId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to archive booking");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Booking archived", description: "It no longer appears in your list." });
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/bookings"] });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't archive booking", description: getApiErrorMessage(err), variant: "destructive" });
    },
    onSettled: () => {
      setArchiveModalBookingId(null);
    },
  });

  const proposalMutation = useMutation({
    mutationFn: async (payload: { bookingId: string; amountCents: number; reason?: string }) => {
      const res = await apiRequest("POST", `/api/bookings/${payload.bookingId}/travel-fee-proposals`, {
        amountCents: payload.amountCents,
        reason: payload.reason || undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to submit proposal");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Travel fee proposed", description: "The customer has been notified." });
      setProposalBookingId(null);
      setProposalAmount("");
      setProposalReason("");
      setProposalError(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/vendor/bookings"] });
    },
    onError: (err: Error) => {
      setProposalError(err.message);
    },
  });

  const parsedBookings = useMemo(() => {
    const normalizeStatus = (s: any) => String(s || "").toLowerCase();

    // Fee rates may not have loaded yet. Computing here with a 0 placeholder is
    // safe: the CardContent render gate below (isLoading || !feeRates) keeps this
    // list off-screen until feeRates is actually loaded, so no fee figure derived
    // from the placeholder is ever shown to the vendor. Don't gate here too — an
    // empty return would tell the vendor "you have no bookings", which is a false
    // and stronger claim than simply deferring the fee number.
    const vendorFeeRate = feeRates?.vendorFeeRate ?? 0;

    return (bookings || [])
      .map((b) => {
        let d: Date | null = null;
        const normalizedGoogleSyncStatus = String(b?.googleSyncStatus || "").toLowerCase();
        const isGoogleSynced =
          normalizedGoogleSyncStatus === "synced" ||
          normalizedGoogleSyncStatus === "cancelled" ||
          Boolean(b?.googleEventId);

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
          ...deriveBookingAmounts(b, vendorFeeRate),
          googleSyncLabel: isGoogleSynced ? "synced" : "unsynced",
          status: normalizeStatus(b.status),
          isPast: isEventEnded(b.eventDate, b.eventEndTime),
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
        googleSyncLabel: "synced" | "unsynced";
        status: string;
        isPast: boolean;
        raw: VendorBooking;
      }>;
  }, [bookings, feeRates]);

  const tabFilteredItems = useMemo(() => {
    const matchesTab = (x: { date: Date; status: string; isPast: boolean }) => {
      if (activeTab === "all") return true;
      if (activeTab === "upcoming") return x.status === "confirmed" && !x.isPast;
      if (activeTab === "completed")
        return x.status === "completed" || (x.status === "confirmed" && x.isPast);
      return x.status === activeTab;
    };

    return parsedBookings.filter(matchesTab);
  }, [parsedBookings, activeTab]);

  const summary = useMemo(() => {
    const sortAsc = [...tabFilteredItems].sort((a, b) => a.date.getTime() - b.date.getTime());
    const sortDesc = [...tabFilteredItems].sort((a, b) => b.date.getTime() - a.date.getTime());
    const totalAmount = tabFilteredItems.reduce((acc, x) => acc + (x.amount || 0), 0);
    const first = sortAsc[0] ?? null;
    const last = sortDesc[0] ?? null;

    if (activeTab === "upcoming") {
      return {
        label1: t("vendorBookings.summaryUpcomingLabel1"),
        value1: first?.date ?? null,
        label2: t("vendorBookings.summaryUpcomingLabel2"),
        value2: tabFilteredItems.length,
        label3: t("vendorBookings.summaryUpcomingLabel3"),
        value3: totalAmount,
      };
    }

    if (activeTab === "pending") {
      return {
        label1: t("vendorBookings.summaryPendingLabel1"),
        value1: first?.date ?? null,
        label2: t("vendorBookings.summaryPendingLabel2"),
        value2: tabFilteredItems.length,
        label3: t("vendorBookings.summaryPendingLabel3"),
        value3: totalAmount,
      };
    }

    if (activeTab === "completed") {
      return {
        label1: t("vendorBookings.summaryCompletedLabel1"),
        value1: last?.date ?? null,
        label2: t("vendorBookings.summaryCompletedLabel2"),
        value2: tabFilteredItems.length,
        label3: t("vendorBookings.summaryCompletedLabel3"),
        value3: totalAmount,
      };
    }

    if (activeTab === "cancelled") {
      return {
        label1: t("vendorBookings.summaryCancelledLabel1"),
        value1: last?.date ?? null,
        label2: t("vendorBookings.summaryCancelledLabel2"),
        value2: tabFilteredItems.length,
        label3: t("vendorBookings.summaryCancelledLabel3"),
        value3: totalAmount,
      };
    }

    return {
      label1: t("vendorBookings.summaryAllLabel1"),
      value1: last?.date ?? null,
      label2: t("vendorBookings.summaryAllLabel2"),
      value2: tabFilteredItems.length,
      label3: t("vendorBookings.summaryAllLabel3"),
      value3: totalAmount,
    };
  }, [activeTab, tabFilteredItems, t]);

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

  const handleConnectGoogleCalendar = async () => {
    try {
      setIsGoogleCalendarConnectLoading(true);

      const token = await getAccessTokenSilently({
        authorizationParams: {
          audience: "https://eventhub-api",
          scope: "openid profile email",
        },
      });

      const response = await fetch("/api/google/oauth/start?returnTo=%2Fvendor%2Fbookings", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = (await response.json()) as { url?: string | null; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "Unable to start Google Calendar connection");
      }

      const url = typeof data?.url === "string" ? data.url.trim() : "";
      if (!url) {
        throw new Error("Google OAuth start URL was not returned");
      }

      window.location.assign(url);
    } catch (error: any) {
      setIsGoogleCalendarConnectLoading(false);
      toast({
        title: t("vendorBookings.calendarError"),
        description: getApiErrorMessage(error, "Please try again."),
        variant: "destructive",
      });
    }
  };

  return (
    <VendorShell>
      <div className="max-w-7xl mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            {t("vendorBookings.pageTitle")}
          </h1>
        </div>

        <div className="flex items-start">
          <div className="w-full max-w-xl rounded-xl border border-[hsl(var(--secondary-accent)/0.45)] bg-[hsl(var(--secondary-accent)/0.12)] p-5 sm:p-6">
            <h2 className="font-heading text-[20px] leading-none tracking-tight">{t("vendorBookings.googleCalendar")}</h2>
            {isGoogleConnected ? (
              <>
                <div className="mt-3 text-sm">
                  <span className="font-medium text-foreground">{t("vendorBookings.statusLabel")} </span>
                  <span className="text-emerald-600">{t("vendorBookings.statusConnected")}</span>
                </div>
              </>
            ) : (
              <>
                {vendorAccount?.canUseGoogleSync === false ? (
                  <>
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-[#2a3a42]">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-[#4a6a7d]" />
                      Google Calendar sync is a Pro feature.
                    </p>
                    <div className="mt-4">
                      <Button
                        onClick={() => upgrade.open()}
                        className="bg-[#4a6a7d] hover:bg-[#3f5c6d] text-[#f5f0e8]"
                        data-testid="button-upgrade-google-calendar-bookings"
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" /> Upgrade to Pro
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-3 text-sm">
                      <span className="font-medium text-foreground">{t("vendorBookings.statusLabel")} </span>
                      <span className="text-muted-foreground">{t("vendorBookings.statusNotConnected")}</span>
                    </div>
                    <div className="mt-4">
                      <Button
                        onClick={handleConnectGoogleCalendar}
                        disabled={isGoogleCalendarConnectLoading}
                        data-testid="button-connect-google-calendar-bookings"
                      >
                        {isGoogleCalendarConnectLoading ? t("vendorBookings.googleConnectLoading") : t("vendorBookings.googleConnectButton")}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <section className="px-5 pb-4 pt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-none bg-transparent p-0">
              <TabsTrigger
                value="all"
                className={STATUS_TAB_TRIGGER_ACTIVE_CLASSNAME}
                data-testid="tab-all"
              >
                {t("vendorBookings.tabAll")}
              </TabsTrigger>
              <TabsTrigger
                value="upcoming"
                className={STATUS_TAB_TRIGGER_ACTIVE_CLASSNAME}
                data-testid="tab-upcoming"
              >
                {t("vendorBookings.tabUpcoming")}
              </TabsTrigger>
              <TabsTrigger
                value="pending"
                className={STATUS_TAB_TRIGGER_ACTIVE_CLASSNAME}
                data-testid="tab-pending"
              >
                {t("vendorBookings.tabPending")}
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className={STATUS_TAB_TRIGGER_ACTIVE_CLASSNAME}
                data-testid="tab-completed"
              >
                {t("vendorBookings.tabCompleted")}
              </TabsTrigger>
              <TabsTrigger
                value="cancelled"
                className={STATUS_TAB_TRIGGER_ACTIVE_CLASSNAME}
                data-testid="tab-cancelled"
              >
                {t("vendorBookings.tabCancelled")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-0">
            <div className="px-4 py-2">
              <div className="font-heading text-xl text-muted-foreground">{summary.label1}</div>
              <div className="font-heading mt-1 text-[2rem] font-semibold leading-none">
                {summary.value1 instanceof Date
                  ? summary.value1.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : t("vendorBookings.noMatchingDate")}
              </div>
            </div>

            <div className="hidden px-2 md:flex md:items-center md:justify-center">
              <div className="h-14 w-px bg-[rgba(74,106,125,0.22)]" />
            </div>

            <div className="px-4 py-2">
              <div className="font-heading text-xl text-muted-foreground">{summary.label2}</div>
              <div className="font-heading mt-1 text-[2rem] font-semibold leading-none">{summary.value2}</div>
            </div>

            <div className="hidden px-2 md:flex md:items-center md:justify-center">
              <div className="h-14 w-px bg-[rgba(74,106,125,0.22)]" />
            </div>

            <div className="px-4 py-2">
              <div className="font-heading text-xl text-muted-foreground">{summary.label3}</div>
              <div className="font-heading mt-1 text-[2rem] font-semibold leading-none">
                {new Intl.NumberFormat(undefined, {
                  style: "currency",
                  currency: "USD",
                }).format((summary.value3 || 0) / 100)}
              </div>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{viewMode === "calendar" ? t("vendorBookings.cardCalendarTitle") : t("vendorBookings.cardListTitle")}</CardTitle>
              <CardDescription>
                {viewMode === "calendar"
                  ? t("vendorBookings.cardCalendarDesc")
                  : t("vendorBookings.cardListDesc")}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "calendar" ? "default" : "outline"}
                onClick={() => setViewMode("calendar")}
              >
                {t("vendorBookings.viewCalendar")}
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                onClick={() => setViewMode("list")}
              >
                {t("vendorBookings.viewList")}
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading || !feeRates ? (
              <div className="text-center py-12 text-muted-foreground">{t("vendorBookings.loading")}</div>
            ) : isError ? (
              <div className="text-center py-10 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-70" />
                {error instanceof Error ? error.message : "Unable to load bookings right now."}
              </div>
            ) : viewMode === "calendar" ? (
              <>
                <div className="mb-4 flex items-center justify-center gap-3">
                  <Button variant="outline" onClick={goPrevMonth} aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="min-w-[170px] text-center font-medium">{monthLabel}</div>

                  <Button variant="outline" onClick={goNextMonth} aria-label="Next month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Day-of-week header — locale-aware via Intl */}
                <div className="grid grid-cols-7 text-sm font-medium text-muted-foreground mb-2">
                  {Array.from({ length: 7 }, (_, i) => {
                    // Jan 7 2024 is a Sunday; offset by i to get Mon–Sat
                    const d = new Date(2024, 0, 7 + i);
                    return d.toLocaleString(i18n.language, { weekday: "short" });
                  }).map((dayLabel) => (
                    <div key={dayLabel} className="px-2 py-1">
                      {dayLabel}
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
                            <div className="text-sm text-muted-foreground">{items.length}</div>
                          ) : null}
                        </div>

                        {items.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {items.slice(0, 3).map((it) => (
                              <div key={it.id} className="text-sm truncate">
                                • {it.status}
                                {` · ${it.googleSyncLabel === "synced" ? t("vendorBookings.syncedLabel") : t("vendorBookings.unsyncedLabel")}`}
                                {it.estimatedPayoutCents != null
                                  ? ` — ${formatUsd(it.estimatedPayoutCents)}`
                                  : ""}
                              </div>
                            ))}
                            {items.length > 3 ? (
                              <div className="text-sm text-muted-foreground">
                                {t("vendorBookings.calendarMoreItems", { count: items.length - 3 })}
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
                    {t("vendorBookings.noBookings")}
                  </div>
                ) : null}
              </>
            ) : listItems.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Calendar className="h-10 w-10 mx-auto mb-3 opacity-70" />
                {t("vendorBookings.noBookings")}
              </div>
            ) : (
              <div className="space-y-3">
                {listItems.map((item) => (
                  <div key={item.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">
                        {item.raw.parentListingTitle && item.raw.itemTitle
                          ? `${item.raw.parentListingTitle} — ${item.raw.itemTitle}`
                          : item.raw.itemTitle || `Booking #${item.id.slice(0, 8)}`}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="capitalize text-muted-foreground">
                          {item.status === "confirmed" && item.isPast
                            ? "Awaiting completion"
                            : item.status || "unknown"}
                        </span>
                        <span
                          className={[
                            "rounded-full border px-2 py-0.5 text-sm font-medium uppercase tracking-wide",
                            item.googleSyncLabel === "synced"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700",
                          ].join(" ")}
                        >
                          {item.googleSyncLabel === "synced" ? t("vendorBookings.syncedLabel") : t("vendorBookings.unsyncedLabel")}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {item.date.toLocaleString(i18n.language, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {(() => {
                        const start = formatTimeString(item.raw.eventStartTime);
                        const end = formatTimeString(item.raw.eventEndTime);
                        if (!start) return null;
                        return (
                          <span> · {start}{end ? ` – ${end}` : ""}</span>
                        );
                      })()}
                      {isTimezoneMismatch(item.raw.eventTimezone, item.raw.vendorTimezoneSnapshot) ? (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700"
                          title={`Event is in ${getTzName(item.raw.eventTimezone!)} (${getTzAbbr(item.raw.eventTimezone!)})`}
                        >
                          <Globe className="h-3 w-3" />
                          {getTzAbbr(item.raw.eventTimezone!)}
                        </span>
                      ) : null}
                    </div>
                    {item.raw.customerEventTitle ? (
                      <div className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.raw.customerEventTitle}</span>
                      </div>
                    ) : null}
                    <div className="mt-1 text-sm">
                      <span className="text-muted-foreground">{t("vendorBookings.estimatedPayoutLabel")} </span>
                      <span className="font-medium">{formatUsd(item.estimatedPayoutCents || 0)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExpandedBookingId(expandedBookingId === item.id ? null : item.id)}
                      >
                        {expandedBookingId === item.id ? t("vendorBookings.hideDetails") : t("vendorBookings.viewDetails")}
                      </Button>
                      {isChatWindowOpen(item.raw.eventDate) &&
                        item.status !== "cancelled" &&
                        item.status !== "failed" &&
                        item.status !== "expired" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/vendor/messages?bookingId=${item.id}`)}
                          >
                            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                            Message Customer
                          </Button>
                        )}
                      {(item.status === "cancelled" ||
                        item.status === "completed" ||
                        item.status === "expired" ||
                        item.status === "failed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setArchiveModalBookingId(item.id)}
                          disabled={archiveMutation.isPending}
                        >
                          Archive
                        </Button>
                      )}
                    </div>
                    {expandedBookingId === item.id ? (
                      <div className="mt-3 rounded-md border bg-muted/30 p-3 space-y-3">
                        {item.raw.customerName ? (
                          <div className="space-y-1">
                            <div className="text-sm uppercase tracking-wide text-muted-foreground">Customer</div>
                            <div className="text-sm">{item.raw.customerName}</div>
                          </div>
                        ) : null}
                        {isTimezoneMismatch(item.raw.eventTimezone, item.raw.vendorTimezoneSnapshot) ? (
                          <div className="rounded-md border border-violet-200 bg-violet-50 p-3 flex items-start gap-2">
                            <Clock className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
                            <div className="space-y-0.5">
                              <div className="text-sm font-medium text-violet-800">Event is in a different timezone</div>
                              <div className="text-xs text-violet-700">
                                Event location: {getTzName(item.raw.eventTimezone!)} ({getTzAbbr(item.raw.eventTimezone!)})
                              </div>
                              <div className="text-xs text-violet-700">
                                Your listing: {getTzName(item.raw.vendorTimezoneSnapshot!)} ({getTzAbbr(item.raw.vendorTimezoneSnapshot!)})
                              </div>
                              <div className="text-xs text-violet-600 pt-0.5">
                                Booking times are displayed in the event's local timezone.
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="space-y-1">
                          <div className="text-sm uppercase tracking-wide text-muted-foreground">{t("vendorBookings.feeBreakdown")}</div>
                          <div className="text-sm flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t("vendorBookings.googleCalendar")}</span>
                            <span>{item.googleSyncLabel === "synced" ? t("vendorBookings.syncedLabel") : t("vendorBookings.unsyncedLabel")}</span>
                          </div>
                          <div className="text-sm flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t("vendorBookings.listingPrice")}</span>
                            <span>{formatUsd(item.listingPriceCents)}</span>
                          </div>
                          {item.raw.addOnItems?.map((a) => (
                            <div key={a.title} className="text-sm flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{a.title}</span>
                              <span>{formatUsd(a.priceCents)}</span>
                            </div>
                          ))}
                          {item.customerFeeCents > 0 ? (
                            <div className="text-sm flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{t("vendorBookings.customerServiceFee")}</span>
                              <span>{formatUsd(item.customerFeeCents)}</span>
                            </div>
                          ) : null}
                          <div className="text-sm flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t("vendorBookings.customerTotal")}</span>
                            <span>{formatUsd(item.customerTotalCents)}</span>
                          </div>
                          <div className="text-sm flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">{t("vendorBookings.eventhubFee")}</span>
                            <span>-{formatUsd(item.vendorFeeCents)}</span>
                          </div>
                          <div className="pt-1 text-sm font-medium flex items-center justify-between gap-3">
                            <span>{t("vendorBookings.estimatedPayout")}</span>
                            <span>{formatUsd(item.estimatedPayoutCents)}</span>
                          </div>
                        </div>
                        {item.raw.customerNotes ? (
                          <div>
                            <div className="text-sm uppercase tracking-wide text-muted-foreground">{t("vendorBookings.notes")}</div>
                            <div className="text-sm">{item.raw.customerNotes}</div>
                          </div>
                        ) : null}
                        {item.raw.customerQuestions ? (
                          <div>
                            <div className="text-sm uppercase tracking-wide text-muted-foreground">{t("vendorBookings.questions")}</div>
                            <div className="text-sm">{item.raw.customerQuestions}</div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {/* Request-to-book (pending): vendor must accept or decline */}
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
                            ? t("vendorBookings.accepting")
                            : t("vendorBookings.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCancelModalBookingId(item.id)}
                          disabled={bookingActionMutation.isPending}
                        >
                          {t("vendorBookings.decline")}
                        </Button>
                      </div>
                    ) : null}
                    {/* Confirmed & upcoming: vendor may still cancel. Completion is
                        normally automatic, but once the event has ended we swap Cancel
                        for a manual "Mark as complete" so the booking can't linger. */}
                    {item.status === "confirmed" && !item.isPast ? (
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCancelModalBookingId(item.id)}
                          disabled={bookingActionMutation.isPending}
                        >
                          {bookingActionMutation.isPending && actionBookingId === item.id
                            ? "Cancelling…"
                            : "Cancel"}
                        </Button>
                      </div>
                    ) : null}
                    {item.status === "confirmed" && item.isPast ? (
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
                            ? "Marking complete…"
                            : "Mark as complete"}
                        </Button>
                      </div>
                    ) : null}
                    {bookingActionMutation.isError && actionBookingId === item.id ? (
                      <div className="mt-2 text-sm text-destructive">
                        {bookingActionMutation.error instanceof Error
                          ? bookingActionMutation.error.message
                          : t("vendorBookings.failedToUpdate")}
                      </div>
                    ) : null}

                    {/* Travel / delivery fee proposal */}
                    {item.raw.outsideServiceRadius &&
                      !item.isPast &&
                      (item.status === "pending" || item.status === "confirmed") ? (
                      item.raw.travelFeeProposal?.status === "accepted" ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium text-emerald-800">Travel/delivery fee paid</div>
                            <div className="text-xs text-emerald-700">
                              The customer paid {formatUsd(item.raw.travelFeeProposal.amountCents)} for the travel/delivery fee.
                            </div>
                          </div>
                        </div>
                      ) : (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                          <MapPin className="h-4 w-4 shrink-0" />
                          Event is outside your service radius
                        </div>
                        {item.raw.eventLocation ? (
                          <p className="text-xs text-amber-700">{item.raw.eventLocation}</p>
                        ) : null}
                        {proposalBookingId === item.id ? (
                          <div className="space-y-2 pt-1">
                            <div className="space-y-1">
                              <Label className="text-xs">Fee amount (USD)</Label>
                              <div className="relative max-w-[160px]">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                <Input
                                  className="pl-7 h-8 text-sm"
                                  inputMode="decimal"
                                  placeholder="e.g. 75"
                                  value={proposalAmount}
                                  onChange={(e) => setProposalAmount(e.target.value.replace(/[^\d.]/g, ""))}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Reason (optional)</Label>
                              <Input
                                className="h-8 text-sm"
                                placeholder="e.g. 45 miles outside service area"
                                value={proposalReason}
                                onChange={(e) => setProposalReason(e.target.value)}
                              />
                            </div>
                            {proposalError ? (
                              <p className="text-xs text-destructive">{proposalError}</p>
                            ) : null}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={proposalMutation.isPending || !proposalAmount}
                                onClick={() => {
                                  const cents = Math.round(parseFloat(proposalAmount) * 100);
                                  if (!cents || cents <= 0) {
                                    setProposalError("Enter a valid amount");
                                    return;
                                  }
                                  setProposalError(null);
                                  proposalMutation.mutate({
                                    bookingId: item.id,
                                    amountCents: cents,
                                    reason: proposalReason || undefined,
                                  });
                                }}
                              >
                                {proposalMutation.isPending ? "Sending…" : "Send proposal"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setProposalBookingId(null);
                                  setProposalAmount("");
                                  setProposalReason("");
                                  setProposalError(null);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : item.raw.travelFeeProposal?.status === "pending" ? (
                          <p className="pt-1 text-sm font-medium text-amber-800">
                            Proposal sent — awaiting customer response · {formatUsd(item.raw.travelFeeProposal.amountCents)}
                          </p>
                        ) : item.raw.travelFeeProposal?.status === "declined" ? (
                          <div className="space-y-2 pt-1">
                            <p className="text-sm text-amber-800">
                              The customer declined your {formatUsd(item.raw.travelFeeProposal.amountCents)} proposal.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-300 hover:bg-amber-100"
                                onClick={() => {
                                  setProposalAmount("");
                                  setProposalReason("");
                                  setProposalError(null);
                                  setProposalBookingId(item.id);
                                }}
                              >
                                Propose a new fee
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setCancelModalBookingId(item.id)}
                              >
                                Cancel event
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-amber-300 hover:bg-amber-100"
                            onClick={() => {
                              setProposalAmount("");
                              setProposalReason("");
                              setProposalError(null);
                              setProposalBookingId(item.id);
                            }}
                          >
                            Propose travel/delivery fee
                          </Button>
                        )}
                      </div>
                      )
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Archive confirmation modal */}
      <Dialog
        open={Boolean(archiveModalBookingId)}
        onOpenChange={(open) => {
          if (!open) setArchiveModalBookingId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Archive this booking?</DialogTitle>
          <DialogDescription>
            It will be removed from your bookings list. This won't notify the customer or change
            the booking — it just hides it from your view.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setArchiveModalBookingId(null)}
            >
              Go back
            </Button>
            <Button
              size="sm"
              disabled={archiveMutation.isPending}
              onClick={() => {
                if (!archiveModalBookingId) return;
                archiveMutation.mutate(archiveModalBookingId);
              }}
            >
              {archiveMutation.isPending ? "Archiving…" : "Archive"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancellation reason modal */}
      <Dialog
        open={Boolean(cancelModalBookingId)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelModalBookingId(null);
            setCancelReasonSelected("");
            setCancelReasonOther("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Why are you cancelling this booking?</DialogTitle>
          <DialogDescription>
            This reason will be shared with the customer and saved for our records.
          </DialogDescription>
          <div className="mt-3 space-y-2">
            {VENDOR_CANCEL_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2.5 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="vendor-cancel-reason"
                  value={r}
                  checked={cancelReasonSelected === r}
                  onChange={() => setCancelReasonSelected(r)}
                  className="accent-[#e07a6a]"
                />
                {r}
              </label>
            ))}
            {cancelReasonSelected === "Other" && (
              <Textarea
                className="mt-2 text-sm"
                placeholder="Please describe your reason…"
                value={cancelReasonOther}
                onChange={(e) => setCancelReasonOther(e.target.value)}
                maxLength={500}
                rows={3}
              />
            )}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCancelModalBookingId(null);
                setCancelReasonSelected("");
                setCancelReasonOther("");
              }}
            >
              Go back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={
                !cancelReasonSelected ||
                (cancelReasonSelected === "Other" && !cancelReasonOther.trim()) ||
                bookingActionMutation.isPending
              }
              onClick={() => {
                if (!cancelModalBookingId || !cancelReasonSelected) return;
                const reason =
                  cancelReasonSelected === "Other" ? cancelReasonOther.trim() : cancelReasonSelected;
                setActionBookingId(cancelModalBookingId);
                bookingActionMutation.mutate({
                  id: cancelModalBookingId,
                  status: "cancelled",
                  cancellationReason: reason,
                });
              }}
            >
              {bookingActionMutation.isPending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </VendorShell>
  );
}
