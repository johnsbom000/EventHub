import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ListingPublic } from "@/types/listing";
import { useLocation } from "wouter";
import { ArrowUpRight, Check, Heart, Link2, Mail, MessageCircle, Plus, Share2 } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  coverRatioToAspectRatio,
  getCoverPhotoIndex,
  getCoverPhotoRatio,
  getListingPhotoUrls,
  moveCoverToFront,
} from "@/lib/listingPhotos";
import { getListingDisplayPrice, getListingDisplayPricingUnit } from "@/lib/listingPrice";

function ShareSquareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[30px] w-[30px]"
    >
      <path d="M12 14V3.5" />
      <path d="m8.5 6.8 3.5-3.3 3.5 3.3" />
      <path d="M6.4 10.2v8.4c0 1.1.9 2 2 2h7.2c1.1 0 2-.9 2-2v-8.4" />
    </svg>
  );
}

// ── Board / event types ────────────────────────────────────────────────────

interface BoardWithMembership {
  id: string;
  name: string;
  savedCount: number;
  hasSaved: boolean;
}

// ── Pinterest-style heart popover ──────────────────────────────────────────

function HeartBoardPopover({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Close when user clicks outside the popover
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  useEffect(() => {
    if (showCreate) inputRef.current?.focus();
  }, [showCreate]);

  const { data: boards = [], isLoading } = useQuery<BoardWithMembership[]>({
    queryKey: [`/api/boards/for-listing/${listingId}`],
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [`/api/boards/for-listing/${listingId}`] });
    qc.invalidateQueries({ queryKey: ["/api/boards/saved-ids"] });
    qc.invalidateQueries({ queryKey: ["/api/boards"] });
    // Invalidate board detail queries so the planning section refreshes
    boards.forEach((b) => {
      qc.invalidateQueries({ queryKey: [`/api/boards/${b.id}/listings`] });
    });
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ boardId, hasSaved }: { boardId: string; hasSaved: boolean }) => {
      if (hasSaved) {
        await apiRequest("DELETE", `/api/boards/${boardId}/listings/${listingId}`);
      } else {
        await apiRequest("POST", `/api/boards/${boardId}/listings`, { listingId });
      }
    },
    onSuccess: invalidate,
  });

  const createAndSaveMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/boards", { name });
      const board = await res.json();
      await apiRequest("POST", `/api/boards/${board.id}/listings`, { listingId });
    },
    onSuccess: () => {
      invalidate();
      setNewName("");
      setShowCreate(false);
    },
  });

  return (
    <div
      ref={popoverRef}
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-full right-0 z-50 mb-2 w-52 overflow-hidden rounded-2xl border border-[rgba(74,106,125,0.18)] bg-white shadow-xl dark:bg-[#22303c]"
    >
      <p className="border-b border-[rgba(74,106,125,0.1)] px-3.5 py-2 text-[0.7rem] font-semibold uppercase tracking-wider text-[#4a6a7d]">
        Save to event
      </p>

      {isLoading ? (
        <p className="px-3.5 py-3 text-sm text-[#4a6a7d]/60">Loading…</p>
      ) : boards.length === 0 && !showCreate ? (
        <p className="px-3.5 py-3 text-sm text-[#4a6a7d]/60">No events yet</p>
      ) : (
        <ul className="max-h-44 overflow-y-auto py-1">
          {boards.map((board) => (
            <li key={board.id}>
              <button
                type="button"
                onClick={() => toggleMutation.mutate({ boardId: board.id, hasSaved: board.hasSaved })}
                disabled={toggleMutation.isPending}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition hover:bg-[rgba(74,106,125,0.07)] disabled:opacity-60"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    board.hasSaved
                      ? "border-[#e07a6a] bg-[#e07a6a]"
                      : "border-[rgba(74,106,125,0.35)]"
                  }`}
                >
                  {board.hasSaved && <Check className="h-2.5 w-2.5 text-white" />}
                </span>
                <span className="truncate text-[#2a3a42] dark:text-[#f5f0e8]">{board.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCreate ? (
        <div className="border-t border-[rgba(74,106,125,0.1)] px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) createAndSaveMutation.mutate(newName.trim());
              if (e.key === "Escape") setShowCreate(false);
            }}
            placeholder="Event name"
            maxLength={120}
            className="w-full rounded-lg border border-[rgba(74,106,125,0.24)] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[#e07a6a] dark:text-[#f5f0e8]"
          />
          <button
            type="button"
            onClick={() => { if (newName.trim()) createAndSaveMutation.mutate(newName.trim()); }}
            disabled={!newName.trim() || createAndSaveMutation.isPending}
            className="mt-2 w-full rounded-lg bg-[#e07a6a] py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Create &amp; save
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex w-full items-center gap-2.5 border-t border-[rgba(74,106,125,0.1)] px-3.5 py-2.5 text-sm font-medium text-[#e07a6a] transition hover:bg-[rgba(224,122,106,0.06)]"
        >
          <Plus className="h-3.5 w-3.5" />
          New event
        </button>
      )}
    </div>
  );
}

// ── ListingCard ────────────────────────────────────────────────────────────

interface ListingCardProps {
  listing: ListingPublic;
  priceScale?: "default" | "oneAndHalf" | "double";
  titleScale?: "default" | "oneAndQuarter" | "oneAndHalf";
  titleSizeClassName?: string;
  priceSizeClassName?: string;
  titleFont?: "sans" | "heading";
  primaryActionScale?: "default" | "plus15";
  showVendorShopButton?: boolean;
  disableCardNavigation?: boolean;
  cardNavigationPath?: string | null;
  primaryActionLabel?: string;
  primaryActionPath?: string | null;
}

export default function ListingCard({
  listing,
  priceScale = "default",
  titleScale = "default",
  titleSizeClassName,
  priceSizeClassName,
  titleFont = "sans",
  primaryActionScale = "default",
  showVendorShopButton = false,
  disableCardNavigation = false,
  cardNavigationPath,
  primaryActionLabel = "View Listing",
  primaryActionPath,
}: ListingCardProps) {
  const [, setLocation] = useLocation();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [coverLoadFailed, setCoverLoadFailed] = useState(false);
  const [heartOpen, setHeartOpen] = useState(false);
  const { isAuthenticated } = useAuth0();
  const listingAny = listing as any;

  const title = listingAny.title ?? listingAny.listingData?.listingTitle ?? listing.serviceType ?? "Service";
  const priceValue = getListingDisplayPrice(listingAny);
  const pricingUnit = getListingDisplayPricingUnit(listingAny);
  const showPerHourSuffix = pricingUnit === "per_hour";

  const allPhotoUrls = getListingPhotoUrls(listingAny);
  const coverIndex = getCoverPhotoIndex(listingAny, allPhotoUrls);
  const orderedPhotos = moveCoverToFront(allPhotoUrls, coverIndex);
  const cover = orderedPhotos[0] ?? null;
  const coverAspectRatio = coverRatioToAspectRatio(getCoverPhotoRatio(listingAny));

  useEffect(() => {
    setCoverLoadFailed(false);
  }, [cover]);

  const listingId = listingAny.id ?? listingAny.listingId ?? listingAny.listing?.id ?? listingAny.vendorListingId;
  const listingPath = listingId ? `/listing/${listingId}` : null;
  const resolvedCardNavigationPath = cardNavigationPath ?? listingPath;
  const resolvedPrimaryActionPath = primaryActionPath ?? listingPath;
  const canOpenListingFromCard = !disableCardNavigation && Boolean(resolvedCardNavigationPath);
  const vendorId = String(
    listingAny.vendorId ?? listingAny.accountId ?? listingAny.vendor?.id ?? ""
  ).trim();
  const vendorShopPath = vendorId ? `/shop/${vendorId}` : null;
  const vendorShopLabel =
    String(listingAny.vendorName ?? listingAny.vendor?.businessName ?? "Vendor").trim() || "Vendor";

  const shareUrl = useMemo(() => {
    const fallbackPath = listingPath ?? "/";
    if (typeof window === "undefined") return fallbackPath;
    return `${window.location.origin}${fallbackPath}`;
  }, [listingPath]);

  // Determine if this listing is saved to any board (drives heart fill state)
  const { data: savedIdsData } = useQuery<{ listingIds: string[] }>({
    queryKey: ["/api/boards/saved-ids"],
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });
  const isSaved = Boolean(listingId && savedIdsData?.listingIds.includes(listingId));

  const handleOpenListing = () => {
    if (!resolvedCardNavigationPath) return;
    setLocation(resolvedCardNavigationPath);
  };

  const handleOpenPrimaryAction = () => {
    if (!resolvedPrimaryActionPath) return;
    setLocation(resolvedPrimaryActionPath);
  };

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback("Link copied.");
      } else {
        setShareFeedback("Clipboard unavailable on this browser.");
      }
    } catch {
      setShareFeedback("Couldn't copy link. Please copy from address bar.");
    }
  };

  const handleOpenVendorShop = () => {
    if (!vendorShopPath) return;
    setLocation(vendorShopPath);
  };

  const smsHref = `sms:?&body=${encodeURIComponent(`Check out this listing on EventHub: ${shareUrl}`)}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(
    "Check out this EventHub listing"
  )}&body=${encodeURIComponent(`I found this on EventHub:\n${shareUrl}`)}`;

  const resolvedTitleSizeClass =
    titleSizeClassName ??
    (titleScale === "oneAndHalf"
      ? "text-[2.6875rem]"
      : titleScale === "oneAndQuarter"
        ? "text-[1.386rem]"
        : "text-[1.05rem]");
  const resolvedPriceSizeClass =
    priceSizeClassName ??
    (priceScale === "double"
      ? "text-[3.0625rem] leading-none"
      : priceScale === "oneAndHalf"
        ? "text-[1.92rem] leading-none"
        : "text-[1.28rem]");
  const primaryActionClasses =
    primaryActionScale === "plus15"
      ? "gap-[0.575rem] px-[1.15rem] py-[0.575rem] text-[1.16rem]"
      : "gap-2 px-4 py-2 text-[1.01rem]";
  const primaryActionIconClasses =
    primaryActionScale === "plus15" ? "h-[1.15rem] w-[1.15rem]" : "h-4 w-4";

  return (
    <>
      <div
        className="listing-card-scale-exempt group relative w-full"
        data-testid={`card-listing-${listingId ?? "unknown"}`}
        role={canOpenListingFromCard ? "link" : undefined}
        tabIndex={canOpenListingFromCard ? 0 : undefined}
        onClick={canOpenListingFromCard ? handleOpenListing : undefined}
        onKeyDown={
          canOpenListingFromCard
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenListing();
                }
              }
            : undefined
        }
      >
        <Card className="cursor-pointer overflow-hidden rounded-[12px] border-0 bg-white shadow-[0_4px_24px_rgba(74,106,125,0.10)] dark:bg-[#22303c]">
          <div className="relative overflow-hidden bg-muted">
            {cover && !coverLoadFailed ? (
              <img
                src={cover}
                alt={title}
                className="block w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                style={{ aspectRatio: coverAspectRatio }}
                onError={() => setCoverLoadFailed(true)}
              />
            ) : (
              <div
                className="flex w-full items-center justify-center bg-[rgba(74,106,125,0.14)] text-sm font-medium text-[#2a3a42] dark:bg-[hsl(var(--card-border)/0.5)] dark:text-[#f5f0e8]"
                style={{ aspectRatio: coverAspectRatio }}
              >
                No photo yet
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-[#1a2530]/0 transition-colors duration-300 group-hover:bg-[#1a2530]/45 group-focus-within:bg-[#1a2530]/45" />

            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenPrimaryAction();
                }}
                className={`inline-flex items-center rounded-full border border-[rgba(74,106,125,0.2)] bg-white/95 font-sans font-medium text-[#2a3a42] shadow-sm backdrop-blur-sm ${primaryActionClasses}`}
                data-testid={`button-view-listing-${listingId ?? "unknown"}`}
              >
                <ArrowUpRight className={primaryActionIconClasses} />
                {primaryActionLabel}
              </button>

              <div className="flex items-center gap-0.5">
                {/* Heart / save-to-event button — authenticated only */}
                {isAuthenticated && listingId ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeartOpen((v) => !v);
                      }}
                      className="inline-flex h-11 w-11 items-center justify-center transition-colors"
                      aria-label={isSaved ? "Saved to event" : "Save to event"}
                      data-testid={`button-save-listing-${listingId ?? "unknown"}`}
                    >
                      <Heart
                        className={`h-[26px] w-[26px] transition-colors ${
                          isSaved
                            ? "fill-[#e07a6a] text-[#e07a6a]"
                            : "text-white/90 hover:fill-[#e07a6a] hover:text-[#e07a6a]"
                        }`}
                      />
                    </button>
                    {heartOpen && (
                      <HeartBoardPopover
                        listingId={listingId}
                        onClose={() => setHeartOpen(false)}
                      />
                    )}
                  </div>
                ) : null}

                {/* Share button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShareFeedback("");
                    setShareOpen(true);
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center text-white/95 transition-colors hover:text-white focus-visible:text-white"
                  aria-label="Share listing"
                  data-testid={`button-share-listing-${listingId ?? "unknown"}`}
                >
                  <ShareSquareIcon />
                </button>
              </div>
            </div>
          </div>
        </Card>

        <div
          className={`flex items-start justify-between gap-3 px-1 ${
            priceScale === "double" || priceScale === "oneAndHalf" ? "mt-1" : "mt-2"
          }`}
        >
          <h3
            className={`line-clamp-2 ${titleFont === "heading" ? "font-heading" : "font-sans"} font-semibold leading-tight text-[#2a3a42] dark:text-[#f5f0e8] ${resolvedTitleSizeClass}`}
          >
            {title}
          </h3>
          <p className={`shrink-0 font-heading font-bold text-[#e07a6a] ${resolvedPriceSizeClass}`}>
            {typeof priceValue === "number" ? (
              <>
                ${priceValue.toLocaleString()}
                {showPerHourSuffix ? (
                  <span className="text-[0.6em] font-bold"> / Hour</span>
                ) : null}
              </>
            ) : (
              "—"
            )}
          </p>
        </div>

        {showVendorShopButton && vendorShopPath ? (
          <div className="mt-2 px-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleOpenVendorShop();
              }}
              className="inline-flex max-w-full items-center rounded-full border border-[rgba(74,106,125,0.24)] bg-white/90 px-3 py-1.5 text-xs font-medium text-[#2a3a42] transition-colors hover:bg-white dark:border-[hsl(var(--card-border))] dark:bg-[#22303c] dark:text-[#f5f0e8]"
              data-testid={`button-visit-vendor-shop-${listingId ?? "unknown"}`}
            >
              <span className="truncate">Visit {vendorShopLabel}</span>
            </button>
          </div>
        ) : null}
      </div>

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="rounded-3xl border border-border bg-card p-6 sm:max-w-[540px]">
          <DialogTitle className="text-center text-[1.74rem] font-semibold text-foreground">
            Share Listing
          </DialogTitle>
          <p className="-mt-2 line-clamp-1 text-center text-[1.01rem] text-muted-foreground">
            {title}
          </p>

          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border px-3 py-3 text-[1.01rem] font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              <Link2 className="h-5 w-5" />
              Copy link
            </button>
            <button
              type="button"
              onClick={() => { if (typeof window !== "undefined") window.location.href = smsHref; }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border px-3 py-3 text-[1.01rem] font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              <MessageCircle className="h-5 w-5" />
              Messages
            </button>
            <button
              type="button"
              onClick={() => { if (typeof window !== "undefined") window.location.href = emailHref; }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border px-3 py-3 text-[1.01rem] font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              <Mail className="h-5 w-5" />
              Email
            </button>
            <button
              type="button"
              onClick={async () => {
                await handleCopyLink();
                if (typeof window !== "undefined") {
                  window.open("https://www.messenger.com/", "_blank", "noopener,noreferrer");
                }
                setShareFeedback("Link copied. Paste it in Messenger.");
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border px-3 py-3 text-[1.01rem] font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground"
            >
              <Share2 className="h-5 w-5" />
              Messenger
            </button>
          </div>

          <div className="break-all rounded-2xl bg-background px-4 py-3 text-[1.01rem] text-muted-foreground">
            {shareUrl}
          </div>
          {shareFeedback ? (
            <p className="text-[1.01rem] font-medium text-primary">{shareFeedback}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
