import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
 Calendar,
 CheckCircle2,
 Heart,
 MapPin,
 MessageSquare,
 Star,
} from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
 Dialog,
 DialogContent,
 DialogTitle,
 DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import ListingCard from "@/components/ListingCard";

// ── Types ──────────────────────────────────────────────────────────────────

interface CustomerEventsProps {
 customer: { id: string; name: string; email: string };
 newBookingId?: string;
 pendingReason?: string;
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
 parentListingTitle?: string | null;
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
 // Booking amounts (bookings.total_amount) are always stored in cents.
 return new Intl.NumberFormat("en-US", {
 style: "currency",
 currency: "USD",
 }).format((cents || 0) / 100);
}

function vendorLabel(b: CustomerBooking) {
 const packageTitle = b.itemTitle?.trim();
 const parentTitle = b.parentListingTitle?.trim();
 const listing = parentTitle && packageTitle
   ? `${parentTitle} — ${packageTitle}`
   : packageTitle ?? null;
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

// ── SavedListingCard ──────────────────────────────────────────────────────

function SavedListingCard({
 listing,
 boardId,
}: {
 listing: SavedListing;
 boardId: string;
}) {
 const { t } = useTranslation();
 const qc = useQueryClient();
 const [confirmOpen, setConfirmOpen] = useState(false);
 const listingId = listing.id ?? listing.listingId;

 const removeMutation = useMutation({
 mutationFn: async () => {
 await apiRequest("DELETE", `/api/boards/${boardId}/listings/${listingId}`);
 },
 onSuccess: () => {
 qc.invalidateQueries({ queryKey: [`/api/boards/${boardId}/listings`] });
 qc.invalidateQueries({ queryKey: ["/api/boards/saved-ids"] });
 qc.invalidateQueries({ queryKey: ["/api/boards"] });
 qc.invalidateQueries({ queryKey: [`/api/boards/for-listing/${listingId}`] });
 setConfirmOpen(false);
 },
 });

 return (
 <>
 <div className="relative w-full max-w-[290px]">
 <ListingCard
 listing={listing}
 showHeartIcon={false}
 priceScale="double"
 titleScale="oneAndHalf"
 titleSizeClassName="text-[1.518rem] md:text-[2rem]"
 priceSizeClassName="text-[1.5rem] leading-none md:text-[2.25rem] md:leading-none"
 titleFont="heading"
 primaryActionScale="plus15"
 />
 {/* Always-visible solid red heart — click to unsave */}
 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 setConfirmOpen(true);
 }}
 aria-label="Remove from event"
 className="absolute right-3 top-3 z-[60]"
 >
 <Heart className="h-7 w-7 drop-shadow-md fill-[#e07a6a] text-[#e07a6a] transition-transform hover:scale-110" />
 </button>
 </div>

 <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
 <DialogContent className="rounded-2xl border border-border bg-card px-6 py-6 sm:max-w-sm">
 <DialogTitle className="text-[1.25rem] font-semibold text-[#2a3a42]">
 {t("customerEvents.removeFromEvent")}
 </DialogTitle>
 <DialogDescription className="text-sm text-[#4a6a7d]">
 {t("customerEvents.removeFromEventDesc")}
 </DialogDescription>
 <div className="mt-4 flex justify-end gap-3">
 <button
 type="button"
 onClick={() => setConfirmOpen(false)}
 className="rounded-full border border-[rgba(74,106,125,0.24)] px-4 py-2 text-sm font-medium text-[#4a6a7d] transition hover:bg-[rgba(74,106,125,0.07)]"
 >
 {t("customerEvents.cancel")}
 </button>
 <button
 type="button"
 onClick={() => removeMutation.mutate()}
 disabled={removeMutation.isPending}
 className="rounded-full bg-[#e07a6a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#d46a5a] disabled:opacity-50"
 >
 {removeMutation.isPending ? "Removing…" : "Remove"}
 </button>
 </div>
 </DialogContent>
 </Dialog>
 </>
 );
}

// Returns true if the 48-hour post-event messaging window is still open.
function isChatWindowOpen(eventDate: string | null | undefined): boolean {
 if (!eventDate) return true;
 const endOfDay = new Date(`${eventDate}T23:59:59.999Z`);
 if (Number.isNaN(endOfDay.getTime())) return true;
 return Date.now() <= endOfDay.getTime() + 48 * 60 * 60 * 1000;
}

// ── BookingRow ─────────────────────────────────────────────────────────────

function BookingRow({ booking, isHighlighted }: { booking: CustomerBooking; isHighlighted?: boolean }) {
 const [, setLocation] = useLocation();
 const canMessage =
   isChatWindowOpen(booking.eventDate) &&
   booking.paymentStatus === "succeeded" &&
   booking.status !== "cancelled" &&
   booking.status !== "failed" &&
   booking.status !== "expired";

 return (
 <div
   data-booking-id={booking.id}
   className={`py-3 rounded-lg transition-all duration-700 ${
     isHighlighted ? "ring-2 ring-[#4a9a6a] ring-offset-2 px-2 bg-[rgba(74,154,106,0.07)]" : "px-2"
   }`}
 >
   <button
     type="button"
     onClick={() => setLocation(`/booking/${booking.id}`)}
     className="w-full flex items-start gap-3 text-left hover:bg-[rgba(74,106,125,0.05)] rounded-md"
   >
     <div className="flex-1 min-w-0">
       <p className="text-[0.9rem] font-semibold text-[#2a3a42] truncate">
         {vendorLabel(booking)}
       </p>
       <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[#4a6a7d]">
         <span className="flex items-center gap-1">
           <Calendar className="h-3 w-3" />
           {format(new Date(`${booking.eventDate}T00:00:00`), "MMM d, yyyy")}
         </span>
         {booking.eventLocation ? (
           <span className="flex items-center gap-1">
             <MapPin className="h-3 w-3" />
             {booking.eventLocation}
           </span>
         ) : null}
         <span className="font-medium text-[#2a3a42]">
           {formatUsd(booking.totalAmount)}
         </span>
       </div>
     </div>
     <Badge
       variant="outline"
       className={`shrink-0 capitalize text-sm ${STATUS_PILL[booking.status] ?? ""}`}
     >
       {booking.status}
     </Badge>
   </button>
   <p className="mt-1 px-0.5 text-xs text-[#4a6a7d]/70">
     Booking ID:{" "}
     <span className="select-text break-all font-mono text-[#2a3a42]">{booking.id}</span>
   </p>
   {canMessage && (
     <div className="mt-2">
       <button
         type="button"
         onClick={() => setLocation(`/dashboard/messages?bookingId=${booking.id}`)}
         className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(74,106,125,0.3)] px-3 py-1 text-xs font-medium text-[#4a6a7d] transition hover:bg-[rgba(74,106,125,0.08)]"
       >
         <MessageSquare className="h-3 w-3" />
         Message Vendor
       </button>
     </div>
   )}
 </div>
 );
}

// ── ReviewForm ─────────────────────────────────────────────────────────────

function ReviewPrompt({ booking }: { booking: CustomerBooking }) {
 const { t } = useTranslation();
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
 <div className="flex items-center gap-1.5 text-sm text-[#4a6a7d]">
 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
 {t("customerEvents.reviewSubmitted")}
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
 className="h-7 border-[#e07a6a] text-[#e07a6a] hover:bg-[rgba(224,122,106,0.08)] text-sm"
 >
 <Star className="mr-1 h-3 w-3" />
 {t("customerEvents.leaveReview")}
 </Button>
 );
 }

 return (
 <div className="mt-2 space-y-2 rounded-xl border border-[rgba(74,106,125,0.18)] bg-[rgba(74,106,125,0.04)] p-3">
 <p className="text-sm font-semibold text-[#2a3a42] ">
 {t("customerEvents.rateLabel")} {booking.itemTitle || t("customerEvents.thisVendor")}
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
 placeholder={t("customerEvents.reviewPlaceholder")}
 className="min-h-[80px] text-sm"
 />
 {error ? <p className="text-sm text-destructive">{error}</p> : null}
 <div className="flex gap-2">
 <Button
 size="sm"
 type="button"
 disabled={submitMutation.isPending || rating < 1 || (body.trim().length > 0 && body.trim().length < 6)}
 onClick={() => submitMutation.mutate()}
 className="bg-[#e07a6a] text-white hover:bg-[#c9685a]"
 >
 {t("customerEvents.submit")}
 </Button>
 <Button
 size="sm"
 type="button"
 variant="ghost"
 disabled={submitMutation.isPending}
 onClick={() => setOpen(false)}
 >
 {t("customerEvents.cancel")}
 </Button>
 </div>
 </>
 ) : (
 <p className="text-sm text-[#4a6a7d]/60">{t("customerEvents.selectRating")}</p>
 )}
 </div>
 );
}

// ── PlannedEventSection ────────────────────────────────────────────────────
// One planning board rendered with its booked + saved vendors.

function PlannedEventSection({
 board,
 bookings,
 newBookingId,
}: {
 board: Board;
 bookings: CustomerBooking[];
 newBookingId?: string;
}) {
 const { t } = useTranslation();
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
 const matchedBookings = bookings
   .filter(
     (b) =>
       b.status !== "completed" &&
       eventTitleOf(b)?.toLowerCase() === board.name.toLowerCase(),
   )
   .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());

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
 <h2 className="font-heading text-2xl font-semibold text-[#2a3a42] ">
 {board.name}
 </h2>
 {deletingBoard ? (
 <div className="flex items-center gap-2 text-sm">
 <span className="text-[#4a6a7d]">{t("customerEvents.deleteEvent")}</span>
 <button
 type="button"
 onClick={() => deleteBoardMutation.mutate()}
 disabled={deleteBoardMutation.isPending}
 className="font-medium text-red-500 hover:underline disabled:opacity-50"
 >
 {t("customerEvents.yes")}
 </button>
 <button
 type="button"
 onClick={() => setDeletingBoard(false)}
 className="text-[#4a6a7d] hover:underline"
 >
 {t("customerEvents.cancel")}
 </button>
 </div>
 ) : (
 <button
 type="button"
 onClick={() => setDeletingBoard(true)}
 className="text-sm text-[#4a6a7d]/50 transition hover:text-red-400"
 >
 {t("customerEvents.deleteEventButton")}
 </button>
 )}
 </div>

 {/* Booked vendors */}
 {matchedBookings.length > 0 ? (
 <div>
 <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-[#4a6a7d]">
 {t("customerEvents.bookedVendors")}
 </p>
 <div className="divide-y divide-[rgba(74,106,125,0.1)]">
 {matchedBookings.map((b) => (
 <BookingRow key={b.id} booking={b} isHighlighted={b.id === newBookingId} />
 ))}
 </div>
 </div>
 ) : null}

 {/* Saved vendors */}
 <div>
 <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#4a6a7d]">
 {t("customerEvents.savedVendors")}
 {savedListings.length > 0 ? (
 <span className="ml-1.5 font-normal normal-case text-[#4a6a7d]/60">
 · {savedListings.length}
 </span>
 ) : null}
 </p>

 {loadingSaved ? (
 <div className="grid grid-cols-1 justify-items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {[1, 2, 3].map((i) => (
 <div
 key={i}
 className="aspect-[4/3] w-full max-w-[290px] animate-pulse rounded-xl bg-[rgba(74,106,125,0.08)]"
 />
 ))}
 </div>
 ) : savedListings.length > 0 ? (
 <div className="grid grid-cols-1 justify-items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {savedListings.map((listing: SavedListing) => (
 <SavedListingCard
 key={listing.id ?? listing.listingId}
 listing={listing}
 boardId={board.id}
 />
 ))}
 </div>
 ) : isEmpty ? (
 <p className="text-sm text-[#4a6a7d]/60">
 {t("customerEvents.noSavedVendors")}{" "}
 <a href="/" className="text-[#e07a6a] underline-offset-2 hover:underline">{/* MARKETPLACE_HIDDEN: restore href="/browse" when going live */}
 {t("customerEvents.browseVendors")}
 </a>{" "}
 and heart listings to save them here.
 </p>
 ) : (
 <p className="text-sm text-[#4a6a7d]/60">{t("customerEvents.noSavedListings")}</p>
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
 const { t } = useTranslation();
 const [, setLocation] = useLocation();
 return (
 <div className="space-y-4">
 <h2 className="font-heading text-2xl font-semibold text-[#2a3a42] ">
 {title}
 </h2>
 <div className="divide-y divide-[rgba(74,106,125,0.1)]">
 {bookings.map((b) => (
 <div key={b.id} className="py-4">
 <button
   type="button"
   onClick={() => setLocation(`/booking/${b.id}`)}
   className="w-full text-left flex items-start justify-between gap-3 rounded-lg px-2 py-1 -mx-2 hover:bg-[rgba(74,106,125,0.05)] transition"
 >
 <div>
 <p className="text-[0.9rem] font-semibold text-[#2a3a42] ">
 {vendorLabel(b)}
 </p>
 <p className="mt-0.5 text-sm text-[#4a6a7d]">
 {format(new Date(`${b.eventDate}T00:00:00`), "MMM d, yyyy")}
 {b.eventLocation ? ` · ${b.eventLocation}` : ""}
 {" · "}
 <span className="font-medium">{formatUsd(b.totalAmount)}</span>
 </p>
 </div>
 <Badge
 variant="outline"
 className="shrink-0 text-sm border-[rgba(74,106,125,0.2)] bg-[rgba(74,106,125,0.06)] text-[#4a6a7d]"
 >
 {t("customerEvents.completedBadge")}
 </Badge>
 </button>
 <p className="mt-1 px-0.5 text-xs text-[#4a6a7d]/70">
 Booking ID:{" "}
 <span className="select-text break-all font-mono text-[#2a3a42]">{b.id}</span>
 </p>
 <div className="mt-2 flex flex-wrap items-center gap-3">
   <ReviewPrompt booking={b} />
   {isChatWindowOpen(b.eventDate) && b.paymentStatus === "succeeded" && (
     <button
       type="button"
       onClick={() => setLocation(`/dashboard/messages?bookingId=${b.id}`)}
       className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(74,106,125,0.3)] px-3 py-1 text-xs font-medium text-[#4a6a7d] transition hover:bg-[rgba(74,106,125,0.08)]"
     >
       <MessageSquare className="h-3 w-3" />
       Message Vendor
     </button>
   )}
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}

// ── CustomerEvents (main) ──────────────────────────────────────────────────

type Tab = "planned" | "completed";

export default function CustomerEvents({ customer, newBookingId, pendingReason }: CustomerEventsProps) {
 const { t } = useTranslation();
 const [tab, setTab] = useState<Tab>("planned");
 const [highlightedId, setHighlightedId] = useState<string | undefined>(newBookingId);
 const scrolledRef = useRef(false);

 const { data: bookings = [], isLoading: loadingBookings } = useQuery<CustomerBooking[]>({
 queryKey: ["/api/customer/bookings"],
 enabled: Boolean(customer?.id),
 });

 const { data: boards = [], isLoading: loadingBoards } = useQuery<Board[]>({
 queryKey: ["/api/boards"],
 enabled: Boolean(customer?.id),
 retry: false,
 });

 // Scroll to and briefly highlight the new booking after data loads.
 useEffect(() => {
   if (!highlightedId || loadingBookings || loadingBoards || scrolledRef.current) return;
   const el = document.querySelector(`[data-booking-id="${highlightedId}"]`);
   if (!el) return;
   scrolledRef.current = true;
   el.scrollIntoView({ behavior: "smooth", block: "center" });
   const timer = setTimeout(() => setHighlightedId(undefined), 2500);
   return () => clearTimeout(timer);
 }, [highlightedId, loadingBookings, loadingBoards]);

 const completedBookings = useMemo(
 () => bookings.filter((b) => b.status === "completed"),
 [bookings],
 );

 // Active bookings not matched to any board (show in an "Other" section)
 const unmatchedBookings = useMemo(() => {
 const boardNames = new Set(boards.map((b) => b.name.toLowerCase()));
 return bookings
   .filter(
     (b) =>
       b.status !== "completed" &&
       !boardNames.has(eventTitleOf(b)?.toLowerCase() ?? "__none__"),
   )
   .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
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
 return Array.from(groups.entries())
   .map(([title, bkgs]) => ({
     title,
     bookings: [...bkgs].sort(
       (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
     ),
   }))
   .sort((a, b) => {
     const aDate = new Date(a.bookings[0]?.eventDate ?? 0).getTime();
     const bDate = new Date(b.bookings[0]?.eventDate ?? 0).getTime();
     return aDate - bDate;
   });
 }, [completedBookings]);

 // Sort boards by their earliest active booking event date (soonest first)
 const sortedBoards = useMemo(() => {
   return [...boards].sort((a, b) => {
     const aBookings = bookings.filter(
       (bk) =>
         bk.status !== "completed" &&
         eventTitleOf(bk)?.toLowerCase() === a.name.toLowerCase(),
     );
     const bBookings = bookings.filter(
       (bk) =>
         bk.status !== "completed" &&
         eventTitleOf(bk)?.toLowerCase() === b.name.toLowerCase(),
     );
     const aDate = aBookings.length
       ? Math.min(...aBookings.map((bk) => new Date(bk.eventDate).getTime()))
       : Infinity;
     const bDate = bBookings.length
       ? Math.min(...bBookings.map((bk) => new Date(bk.eventDate).getTime()))
       : Infinity;
     return aDate - bDate;
   });
 }, [boards, bookings]);

 const isLoading = loadingBookings || loadingBoards;

 const [pendingBannerVisible, setPendingBannerVisible] = useState(
   pendingReason === "vendor_has_other_booking"
 );

 return (
 <div className="space-y-6">
 {pendingBannerVisible && (
   <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
     <span>
       Your booking request has been sent. This vendor already has a booking on the same date or time — they'll confirm once they've reviewed.
     </span>
     <button
       type="button"
       onClick={() => setPendingBannerVisible(false)}
       className="shrink-0 text-amber-600 hover:text-amber-800 font-medium"
       aria-label="Dismiss"
     >
       ✕
     </button>
   </div>
 )}
 {/* Header + tab toggle */}
 <div className="flex flex-wrap items-end justify-between gap-3">
 <div>
 <h1 className="text-3xl font-bold" data-testid="text-events-title">
 {t("customerEvents.pageTitle")}
 </h1>
 </div>

 <div className="inline-flex items-center rounded-lg border border-[rgba(74,106,125,0.2)] bg-[rgba(74,106,125,0.05)] p-1">
 <button
 type="button"
 onClick={() => setTab("planned")}
 className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
 tab === "planned"
 ? "bg-white text-[#2a3a42] shadow-sm "
 : "text-[#4a6a7d] hover:text-[#2a3a42]"
 }`}
 >
 <Heart className="mr-1.5 inline h-3.5 w-3.5 -mt-0.5" />
 {t("customerEvents.plannedEvents")}
 </button>
 <button
 type="button"
 onClick={() => setTab("completed")}
 className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
 tab === "completed"
 ? "bg-white text-[#2a3a42] shadow-sm "
 : "text-[#4a6a7d] hover:text-[#2a3a42]"
 }`}
 >
 <CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 -mt-0.5" />
 {t("customerEvents.completedEvents")}
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
 <p className="font-medium text-[#2a3a42] ">
 {t("customerEvents.noPlannedEvents")}
 </p>
 <p className="max-w-xs text-sm text-[#4a6a7d]">
 Browse vendors, heart listings, and create a named event to start
 planning.
 </p>
 {/* MARKETPLACE_HIDDEN: restore href="/browse" when going live */}
 <a
 href="/"
 className="mt-1 rounded-full bg-[#e07a6a] px-5 py-2 text-sm font-medium text-white hover:bg-[#c9685a]"
 >
 {t("customerEvents.browseVendors")}
 </a>
 </div>
 ) : (
 <>
 {sortedBoards.map((board, i) => (
 <div key={board.id}>
 <PlannedEventSection board={board} bookings={bookings} newBookingId={highlightedId} />
 {i < sortedBoards.length - 1 || unmatchedBookings.length > 0 ? (
 <div className="mt-10 h-px w-full bg-[var(--dashboard-divider-blue)]" aria-hidden />
 ) : null}
 </div>
 ))}

 {/* Bookings not tied to any planning board */}
 {unmatchedBookings.length > 0 ? (
 <div className="space-y-3">
 <h2 className="font-heading text-xl font-semibold text-[#2a3a42] ">
 {t("customerEvents.otherBookings")}
 </h2>
 <p className="text-sm text-[#4a6a7d]/70">
 {t("customerEvents.otherBookingsDesc")}
 </p>
 <div className="divide-y divide-[rgba(74,106,125,0.1)]">
 {unmatchedBookings.map((b) => (
 <BookingRow key={b.id} booking={b} isHighlighted={b.id === highlightedId} />
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
 <p className="font-medium text-[#2a3a42] ">
 {t("customerEvents.noCompletedEvents")}
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
