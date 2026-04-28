import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth0 } from "@auth0/auth0-react";
import { ArrowLeft, BookMarked, Trash2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import MasonryListingGrid from "@/components/MasonryListingGrid";
import ListingCard from "@/components/ListingCard";
import { apiRequest } from "@/lib/queryClient";
import type { ListingPublic } from "@/types/listing";

interface BoardDetailResponse {
  board: { id: string; name: string };
  listings: (ListingPublic & { savedAt: string })[];
}

export default function PlanningBoardDetail() {
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth0();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<BoardDetailResponse>({
    queryKey: [`/api/boards/${boardId}/listings`],
    enabled: isAuthenticated && Boolean(boardId),
    retry: false,
  });

  const deleteBoardMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/boards/${boardId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/boards"] });
      setLocation("/boards");
    },
  });

  const removeListingMutation = useMutation({
    mutationFn: async (listingId: string) => {
      await apiRequest("DELETE", `/api/boards/${boardId}/listings/${listingId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/boards/${boardId}/listings`] });
      qc.invalidateQueries({ queryKey: ["/api/boards"] });
    },
  });

  if (!isAuthenticated) {
    return (
      <>
        <Navigation />
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-[#4a6a7d]">Sign in to view your planning boards.</p>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Navigation />
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-[rgba(74,106,125,0.1)]" />
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-[rgba(74,106,125,0.08)]" />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        <Navigation />
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-[#4a6a7d]">Board not found or you don't have access.</p>
          <button
            type="button"
            onClick={() => setLocation("/boards")}
            className="text-sm font-medium text-[#e07a6a] underline"
          >
            Back to boards
          </button>
        </div>
      </>
    );
  }

  const { board, listings } = data;

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => setLocation("/boards")}
              className="mb-3 flex items-center gap-1.5 text-sm text-[#4a6a7d] transition hover:text-[#2a3a42]"
            >
              <ArrowLeft className="h-4 w-4" />
              All boards
            </button>
            <div className="flex items-center gap-3">
              <BookMarked className="h-6 w-6 shrink-0 text-[#e07a6a]" />
              <h1 className="font-heading text-3xl font-semibold text-[#2a3a42]">{board.name}</h1>
            </div>
            <p className="mt-1 pl-9 text-[#4a6a7d]">
              {listings.length} {listings.length === 1 ? "listing" : "listings"} saved
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (confirm(`Delete board "${board.name}"? This cannot be undone.`)) {
                deleteBoardMutation.mutate();
              }
            }}
            disabled={deleteBoardMutation.isPending}
            className="flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete board
          </button>
        </div>

        {/* Listings grid */}
        {listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <BookMarked className="h-10 w-10 text-[#4a6a7d]/30" />
            <p className="text-[#4a6a7d]">No listings saved yet. Browse vendors and save listings to this board.</p>
            <button
              type="button"
              onClick={() => setLocation("/browse")}
              className="mt-1 rounded-full bg-[#e07a6a] px-5 py-2 text-sm font-medium text-white hover:bg-[#c9685a]"
            >
              Browse vendors
            </button>
          </div>
        ) : (
          <MasonryListingGrid
            listings={listings}
            renderCard={(listing) => {
              const id = (listing as any).id ?? (listing as any).listingId;
              return (
                <div key={id} className="relative">
                  <ListingCard listing={listing} showVendorShopButton />
                  <button
                    type="button"
                    onClick={() => removeListingMutation.mutate(id)}
                    disabled={removeListingMutation.isPending}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-[rgba(74,106,125,0.2)] py-1.5 text-xs text-[#4a6a7d] transition hover:border-red-300 hover:text-red-500 disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                </div>
              );
            }}
          />
        )}
      </div>
    </>
  );
}
