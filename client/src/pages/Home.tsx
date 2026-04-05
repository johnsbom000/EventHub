import MasonryListingGrid from "@/components/MasonryListingGrid";
import ListingCard from "@/components/ListingCard";
import type { ListingPublic } from "@/types/listing";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import Navigation from "@/components/Navigation";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";

export default function Home() {
  const { data: publicListings = [], isLoading } = useQuery<ListingPublic[]>({
    queryKey: ["/api/listings/public"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/listings/public");
      return res.json();
    },
  });

  // Optional: show newest first (or whatever you want)
  // If your ListingPublic has createdAt/updatedAt you can sort by that.
  // If not, just keep as-is.
  const featuredListings = useMemo(() => {
    // Show first 20 so Home doesn’t become huge
    return publicListings.slice(0, 20);
  }, [publicListings]);

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] dark:bg-background">
      <Navigation showBottomBorder={false} />

      <main className="flex-1 min-h-[calc(100vh+7rem)] bg-[#ffffff] dark:bg-background">
        <Hero />

        {/* Featured Listings under the hero */}
        <section className="w-full px-4 sm:px-6 lg:px-12 py-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading !text-[32px] font-normal text-[#2a3a42] dark:text-[#f5f0e8]">
                Featured Listings
              </h2>
            </div>

            {/* Optional: link to /browse */}
            <a
              href="/browse"
              className="font-sans text-[1.25rem] font-medium uppercase tracking-[0.1em] text-[#e07a6a]"
              data-testid="link-view-all"
            >
              View all
            </a>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-muted-foreground">Loading listings...</p>
              </div>
            </div>
          ) : featuredListings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No listings available yet.</p>
            </div>
          ) : (
            <MasonryListingGrid
              listings={featuredListings}
              maxColumns={5}
              minCardWidthPx={240}
              cardMaxWidthPx={290}
              renderCard={(listing) => (
                <ListingCard
                  listing={listing}
                  priceScale="double"
                  titleScale="oneAndHalf"
                  titleFont="heading"
                  primaryActionScale="plus15"
                />
              )}
            />
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
