import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Heart,
  MapPin,
  Star,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import {
  coverRatioToAspectRatio,
  getCoverPhotoIndex,
  getCoverPhotoRatio,
  getListingPhotoUrls,
  moveCoverToFront,
} from "@/lib/listingPhotos";
import { getListingDisplayPrice } from "@/lib/listingPrice";

// ── Types ──────────────────────────────────────────────────────────────────

interface CustomerEventsProps {
  customer: { id: string; name: string; email: string };
}

type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired";

interface CustomerBooking {
  id: string;
  status: BookingStatus;
  paymentStatus: string;
  totalAmount: number;
  customerEventId?: string | null;
  customerEventTitle?: string | null;
  eventId?: string | null;
  eventTitle?: string | null;
  eventDate: string;
  eventStartTime?: string | null;
  eventLocation?: string | null;
  listingId?: string | null;
  itemTitle?: string | null;
  displayTitle?: string | null;
  vendorDisplayName?: string | null;
  vendorBusinessName?: string | null;
  reviewSubmitted?: boolean;
  reviewRating?: number | null;
  createdAt: string;
}

interface Board {
  id: string;
  name: string;
  savedCount: number;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SavedListing = any;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatUsd(cents: number) {
  const normalized =
    Number.isInteger(cents) && cents >= 10_000 ? cents : Math.round(cents * 100);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(normalized / 100);
}

function vendorLabel(b: CustomerBooking) {
  const listing = b.itemTitle?.trim();
  const vendor = (b.vendorDisplayName ?? b.vendorBusinessName)?.trim();
  if (listing && vendor) return `${listing} · ${vendor}`;
  return listing ?? vendor ?? b.displayTitle ?? "Vendor";
}

function eventTitleOf(b: CustomerBooking) {
  return b.customerEventTitle?.trim() || b.eventTitle?.trim() || null;
}

const STATUS_PILL: Record<string, string> = {
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-zinc-200 bg-zinc-100 text-zinc-500",
  failed: "border-red-200 bg-red-50 text-red-600",
  expired: "border-zinc-200 bg-zinc-100 text-zinc-500",
  completed: "border-[rgba(74,106,125,0.2)] bg-[rgba(74,106,125,0.08)] text-[#4a6a7d]",
};

// ── SavedListingMiniCard ───────────────────────────────────────────────────

function SavedListingMiniCard({
  listing,
  boardId,
}: {
  listing: SavedListing;
  boardId: string;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [imgFailed, setImgFailed] = useState(false);

  const allPhotos = getListingPhotoUrls(listing);
  const coverIdx = getCoverPhotoIndex(listing, allPhotos);
  const ordered = moveCoverToFront(allPhotos, coverIdx);
  const cover = ordered[0] ?? null;
  const ratio = coverRatioToAspectRatio(getCoverPhotoRatio(listing));
  const price = getListingDisplayPrice(listing);
  const title =
    listing.title ?? listing.listingData?.listingTitle ?? listing.serviceType ?? "Listing";
  const listingId = listing.id ?? listing.listingId;
  const listingPath = listingId ? `/listing/${listingId}` : null;

  const removeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/boards/${boardId}/listings/${listingId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/boards/${boardId}/listings`] });
      qc.invalidateQueries({ queryKey: ["/api/boards/saved-ids"] });
      qc.invalidateQueries({ queryKey: ["/api/boards"] });
      qc.invalidateQueries({
        queryKey: [`/api/boards/for-listing/${listingId}`],
      });
    },
  });

  return (
    <div className="group/mini relative flex flex-col overflow-hidden rounded-xl border border-[rgba(74,106,125,0.14)] bg-white shadow-sm dark:bg-[#22303c]">
      {/* Cover photo */}
      <div className="relative overflow-hidden bg-[rgba(74,106,125,0.08)]">
        {cover && !imgFailed ? (
          <img
            src={cover}
            alt={title}
            className="w-full object-cover"
            style={{ aspectRatio: ratio }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className="flex w-full items-center justify-center text-xs text-[#4a6a7d]/40"
            style={{ aspectRatio: "4/3" }}
          >
            No photo
          </div>
        )}
        {/* Remove (×) button — top-right corner */}
        <button
          type="button"
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          aria-label="Remove from event"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-[#4a6a7d] opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-white hover:text-red-500 group-hover/mini:opacity-100 disabled:opacity-40"
        >
          <span className="text-[13px] font-semibold leading-none">×</span>
        </button>
      </div>

      {/* Info row */}
      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        <p className="line-clamp-1 text-[0.8rem] font-semibold leading-tight text-[#2a3a42] dark:text-[#f5f0e8]">
          {title}
        </p>
        <div className="flex items-center justify-between gap-1">
          <p className="text-[0.75rem] font-bold text-[#e07a6a]">
            {typeof price === "number" ? `$${price.toLocaleString()}` : "—"}
          </p>
          {listingPath ? (
            <button
              type="button"
              onClick={() => setLocation(listingPath)}
              className="flex items-center gap-0.5 rounded-full border border-[rgba(74,106,125,0.22)] px-1.5 py-0.5 text-[0.68rem] font-medium text-[#4a6a7d] transition hover:bg-[rgba(74,106,125,0.08)]"
            >
              View <ArrowUpRight className="h-2.5 w-2.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── BookingRow ─────────────────────────────────────────────────────────────

function BookingRow({ booking }: { booking: CustomerBooking }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-[0.9rem] font-semibold text-[#2a3a42] dark:text-[#f5f0e8] truncate">
          {vendorLabel(booking)}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#4a6a7d]">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(booking.eventDate), "MMM d, yyyy")}
          </span>
          {booking.eventLocation ? (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {booking.eventLocation}
            </span>
          ) : null}
          <span className="font-medium text-[#2a3a42] dark:text-[#f5f0e8]">
            {formatUsd(booking.totalAmount)}
          </span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={`shrink-0 capitalize text-xs ${STATUS_PILL[booking.status] ?? ""}`}
      >
        {booking.status}
      </Badge>
    </div>
  );
}

// ── ReviewForm ─────────────────────────────────────────────────────────────

function ReviewPrompt({ booking }: { booking: CustomerBooking }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/customer/bookings/${booking.id}/review`,
        { rating, body: body.trim() },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customer/bookings"] });
      setOpen(false);
      setRating(0);
      setBody("");
      setError("");
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    },
  });

  if (booking.reviewSubmitted) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[#4a6a7d]">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Review submitted
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={() => setOpen(true)}
        className="h-7 border-[#e07a6a] text-[#e07a6a] hover:bg-[rgba(224,122,106,0.08)] text-xs"
      >
        <Star className="mr-1 h-3 w-3" />
        Leave a review
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-[rgba(74,106,125,0.18)] bg-[rgba(74,106,125,0.04)] p-3">
      <p className="text-xs font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
        Rate {booking.itemTitle || "this vendor"}
      </p>

      {/* Star picker */}
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            aria-label={`${v} star${v !== 1 ? "s" : ""}`}
            onClick={() => setRating(v)}
          >
            <Star
              className={`h-5 w-5 transition-colors ${
                rating >= v
                  ? "fill-[#e07a6a] text-[#e07a6a]"
                  : "text-[rgba(74,106,125,0.3)] hover:text-[#e07a6a]"
              }`}
            />
          </button>
        ))}
      </div>

      {rating > 0 ? (
        <>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share your experience…"
            className="min-h-[80px] text-sm"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              type="button"
              disabled={submitMutation.isPending || body.trim().length < 4}
              onClick={() => submitMutation.mutate()}
              className="bg-[#e07a6a] text-white hover:bg-[#c9685a]"
            >
              Submit
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={submitMutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-[#4a6a7d]/60">Select a rating to continue.</p>
      )}
    </div>
  );
}

// ── PlannedEventSection ────────────────────────────────────────────────────
// One planning board rendered with its booked + saved vendors.

function PlannedEventSection({
  board,
  bookings,
}: {
  board: Board;
  bookings: CustomerBooking[];
}) {
  const qc = useQueryClient();
  const [deletingBoard, setDeletingBoard] = useState(false);

  const { data, isLoading: loadingSaved } = useQuery<{
    board: { id: string; name: string };
    listings: SavedListing[];
  }>({
    queryKey: [`/api/boards/${board.id}/listings`],
    retry: false,
  });

  const savedListings = data?.listings ?? [];

  // Active (non-completed) bookings whose event title matches this board name
  const matchedBookings = bookings.filter(
    (b) =>
      b.status !== "completed" &&
      eventTitleOf(b)?.toLowerCase() === board.name.toLowerCase(),
  );

  const deleteBoardMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/boards/${board.id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boards"] });
      qc.invalidateQueries({ queryKey: ["/api/boards/saved-ids"] });
    },
  });

  const isEmpty = matchedBookings.length === 0 && savedListings.length === 0;

  return (
    <div className="space-y-5">
      {/* Event header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-2xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
          {board.name}
        </h2>
        {deletingBoard ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[#4a6a7d]">Delete event?</span>
            <button
              type="button"
              onClick={() => deleteBoardMutation.mutate()}
              disabled={deleteBoardMutation.isPending}
              className="font-medium text-red-500 hover:underline disabled:opacity-50"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setDeletingBoard(false)}
              className="text-[#4a6a7d] hover:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeletingBoard(true)}
            className="text-xs text-[#4a6a7d]/50 transition hover:text-red-400"
          >
            Delete event
          </button>
        )}
      </div>

      {/* Booked vendors */}
      {matchedBookings.length > 0 ? (
        <div>
          <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-[#4a6a7d]">
            Booked vendors
          </p>
          <div className="divide-y divide-[rgba(74,106,125,0.1)]">
            {matchedBookings.map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Saved vendors */}
      <div>
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#4a6a7d]">
          Saved vendors
          {savedListings.length > 0 ? (
            <span className="ml-1.5 font-normal normal-case text-[#4a6a7d]/60">
              · {savedListings.length}
            </span>
          ) : null}
        </p>

        {loadingSaved ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-[4/3] animate-pulse rounded-xl bg-[rgba(74,106,125,0.08)]"
              />
            ))}
          </div>
        ) : savedListings.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {savedListings.map((listing: SavedListing) => (
              <SavedListingMiniCard
                key={listing.id ?? listing.listingId}
                listing={listing}
                boardId={board.id}
              />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="text-sm text-[#4a6a7d]/60">
            No vendors saved yet.{" "}
            <a href="/browse" className="text-[#e07a6a] underline-offset-2 hover:underline">
              Browse vendors
            </a>{" "}
            and heart listings to save them here.
          </p>
        ) : (
          <p className="text-sm text-[#4a6a7d]/60">No saved vendors yet.</p>
        )}
      </div>
    </div>
  );
}

// ── CompletedEventGroup ────────────────────────────────────────────────────

function CompletedEventGroup({
  title,
  bookings,
}: {
  title: string;
  bookings: CustomerBooking[];
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
        {title}
      </h2>
      <div className="divide-y divide-[rgba(74,106,125,0.1)]">
        {bookings.map((b) => (
          <div key={b.id} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.9rem] font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
                  {vendorLabel(b)}
                </p>
                <p className="mt-0.5 text-xs text-[#4a6a7d]">
                  {format(new Date(b.eventDate), "MMM d, yyyy")}
                  {b.eventLocation ? ` · ${b.eventLocation}` : ""}
                  {" · "}
                  <span className="font-medium">{formatUsd(b.totalAmount)}</span>
                </p>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 text-xs border-[rgba(74,106,125,0.2)] bg-[rgba(74,106,125,0.06)] text-[#4a6a7d]"
              >
                Completed
              </Badge>
            </div>
            <div className="mt-2">
              <ReviewPrompt booking={b} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CustomerEvents (main) ──────────────────────────────────────────────────

type Tab = "planned" | "completed";

export default function CustomerEvents({ customer }: CustomerEventsProps) {
  const [tab, setTab] = useState<Tab>("planned");

  const { data: bookings = [], isLoading: loadingBookings } = useQuery<CustomerBooking[]>({
    queryKey: ["/api/customer/bookings"],
    enabled: Boolean(customer?.id),
  });

  const { data: boards = [], isLoading: loadingBoards } = useQuery<Board[]>({
    queryKey: ["/api/boards"],
    enabled: Boolean(customer?.id),
    retry: false,
  });

  const completedBookings = useMemo(
    () => bookings.filter((b) => b.status === "completed"),
    [bookings],
  );

  // Active bookings not matched to any board (show in an "Other" section)
  const unmatchedBookings = useMemo(() => {
    const boardNames = new Set(boards.map((b) => b.name.toLowerCase()));
    return bookings.filter(
      (b) =>
        b.status !== "completed" &&
        !boardNames.has(eventTitleOf(b)?.toLowerCase() ?? "__none__"),
    );
  }, [bookings, boards]);

  // Group completed bookings by event title
  const completedGroups = useMemo(() => {
    const groups = new Map<string, CustomerBooking[]>();
    for (const b of completedBookings) {
      const key = eventTitleOf(b) ?? "Completed Event";
      const existing = groups.get(key);
      if (existing) existing.push(b);
      else groups.set(key, [b]);
    }
    return Array.from(groups.entries()).map(([title, bkgs]) => ({ title, bookings: bkgs }));
  }, [completedBookings]);

  const isLoading = loadingBookings || loadingBoards;

  return (
    <div className="space-y-6">
      {/* Header + tab toggle */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-events-title">
            My Events
          </h1>
          <p className="mt-1 text-muted-foreground">
            Your planned and completed events.
          </p>
        </div>

        <div className="inline-flex items-center rounded-lg border border-[rgba(74,106,125,0.2)] bg-[rgba(74,106,125,0.05)] p-1">
          <button
            type="button"
            onClick={() => setTab("planned")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "planned"
                ? "bg-white text-[#2a3a42] shadow-sm dark:bg-[#22303c]"
                : "text-[#4a6a7d] hover:text-[#2a3a42]"
            }`}
          >
            <Heart className="mr-1.5 inline h-3.5 w-3.5 -mt-0.5" />
            Planned Events
          </button>
          <button
            type="button"
            onClick={() => setTab("completed")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === "completed"
                ? "bg-white text-[#2a3a42] shadow-sm dark:bg-[#22303c]"
                : "text-[#4a6a7d] hover:text-[#2a3a42]"
            }`}
          >
            <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 -mt-0.5" />
            Completed Events
          </button>
        </div>
      </div>

      <div className="h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <div className="h-6 w-48 animate-pulse rounded-lg bg-[rgba(74,106,125,0.1)]" />
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className="aspect-[4/3] animate-pulse rounded-xl bg-[rgba(74,106,125,0.08)]"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "planned" ? (
        // ── Planned Events ──────────────────────────────────────────────
        <div className="space-y-10">
          {boards.length === 0 && unmatchedBookings.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Heart className="h-10 w-10 text-[#4a6a7d]/25" />
              <p className="font-medium text-[#2a3a42] dark:text-[#f5f0e8]">
                No planned events yet
              </p>
              <p className="max-w-xs text-sm text-[#4a6a7d]">
                Browse vendors, heart listings, and create a named event to start
                planning.
              </p>
              <a
                href="/browse"
                className="mt-1 rounded-full bg-[#e07a6a] px-5 py-2 text-sm font-medium text-white hover:bg-[#c9685a]"
              >
                Browse vendors
              </a>
            </div>
          ) : (
            <>
              {boards.map((board, i) => (
                <div key={board.id}>
                  <PlannedEventSection board={board} bookings={bookings} />
                  {i < boards.length - 1 || unmatchedBookings.length > 0 ? (
                    <div className="mt-10 h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />
                  ) : null}
                </div>
              ))}

              {/* Bookings not tied to any planning board */}
              {unmatchedBookings.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="font-heading text-xl font-semibold text-[#2a3a42] dark:text-[#f5f0e8]">
                    Other Bookings
                  </h2>
                  <p className="text-xs text-[#4a6a7d]/70">
                    These bookings aren't linked to a planning event yet.
                  </p>
                  <div className="divide-y divide-[rgba(74,106,125,0.1)]">
                    {unmatchedBookings.map((b) => (
                      <BookingRow key={b.id} booking={b} />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : (
        // ── Completed Events ────────────────────────────────────────────
        <div className="space-y-10">
          {completedGroups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-[#4a6a7d]/25" />
              <p className="font-medium text-[#2a3a42] dark:text-[#f5f0e8]">
                No completed events yet
              </p>
              <p className="text-sm text-[#4a6a7d]">
                Completed bookings will appear here.
              </p>
            </div>
          ) : (
            completedGroups.map((group, i) => (
              <div key={group.title}>
                <CompletedEventGroup
                  title={group.title}
                  bookings={group.bookings}
                />
                {i < completedGroups.length - 1 ? (
                  <div className="mt-10 h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
