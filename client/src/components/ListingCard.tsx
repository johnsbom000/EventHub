import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ListingPublic } from "@/types/listing";
import { useLocation } from "wouter";
import { ArrowUpRight, Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import {
  coverRatioToAspectRatio,
  getCoverPhotoIndex,
  getCoverPhotoRatio,
  getListingPhotoUrls,
  moveCoverToFront,
} from "@/lib/listingPhotos";
import { getListingDisplayPrice } from "@/lib/listingPrice";

interface ListingCardProps {
  listing: ListingPublic;
}

export default function ListingCard({ listing }: ListingCardProps) {
  const [, setLocation] = useLocation();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const listingAny = listing as any;

  const title = listingAny.listingData?.listingTitle ?? listingAny.title ?? listing.serviceType ?? "Service";
  const priceValue = getListingDisplayPrice(listingAny);

  const allPhotoUrls = getListingPhotoUrls(listingAny);
  const coverIndex = getCoverPhotoIndex(listingAny, allPhotoUrls);
  const orderedPhotos = moveCoverToFront(allPhotoUrls, coverIndex);
  const cover = orderedPhotos[0] ?? null;
  const coverAspectRatio = coverRatioToAspectRatio(getCoverPhotoRatio(listingAny));

  const listingId = listingAny.id ?? listingAny.listingId ?? listingAny.listing?.id ?? listingAny.vendorListingId;
  const listingPath = `/listing/${listingId}`;
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return listingPath;
    return `${window.location.origin}${listingPath}`;
  }, [listingPath]);

  const handleOpenListing = () => {
    if (!listingId) return;
    setLocation(listingPath);
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

  const smsHref = `sms:?&body=${encodeURIComponent(`Check out this listing on EventHub: ${shareUrl}`)}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(
    "Check out this EventHub listing"
  )}&body=${encodeURIComponent(`I found this on EventHub:\n${shareUrl}`)}`;

  return (
    <>
      <Card
        className="group relative cursor-pointer border-none bg-transparent shadow-none overflow-visible"
        data-testid={`card-listing-${listingId ?? "unknown"}`}
        role="link"
        tabIndex={0}
        onClick={handleOpenListing}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpenListing();
          }
        }}
      >
        <div
          className="relative overflow-hidden rounded-[1.6rem] bg-muted"
          style={{ aspectRatio: coverAspectRatio }}
        >
          {cover ? (
            <img
              src={cover}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
              No photo yet
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/50 group-focus-within:bg-black/50" />

          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenListing();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm"
              data-testid={`button-view-listing-${listingId ?? "unknown"}`}
            >
              <ArrowUpRight className="h-4 w-4" />
              View Listing
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShareFeedback("");
                setShareOpen(true);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-sm backdrop-blur-sm"
              aria-label="Share listing"
              data-testid={`button-share-listing-${listingId ?? "unknown"}`}
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <CardContent className="px-2 pb-1 pt-3">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 font-semibold leading-tight text-[clamp(1.2rem,1.55vw,1.55rem)] text-slate-900">
              {title}
            </h3>
            <p className="shrink-0 font-semibold text-[clamp(1.16rem,1.35vw,1.38rem)] text-slate-900">
              {typeof priceValue === "number" ? `$${priceValue.toLocaleString()}` : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="rounded-3xl border border-slate-200/80 p-6 sm:max-w-[540px]">
          <DialogTitle className="text-center text-2xl font-semibold text-slate-900">Share Listing</DialogTitle>
          <p className="-mt-2 line-clamp-1 text-center text-sm text-slate-500">{title}</p>

          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Link2 className="h-5 w-5" />
              Copy link
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return;
                window.location.href = smsHref;
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <MessageCircle className="h-5 w-5" />
              Messages
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return;
                window.location.href = emailHref;
              }}
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
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
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <Share2 className="h-5 w-5" />
              Messenger
            </button>
          </div>

          <div className="break-all rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{shareUrl}</div>
          {shareFeedback ? <p className="text-sm font-medium text-emerald-700">{shareFeedback}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
