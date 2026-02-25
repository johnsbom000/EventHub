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
    <div className="min-h-screen flex flex-col bg-white">
      <Navigation />

      <main className="flex-1 bg-background">
        <Hero />

        {/* Featured Listings under the hero */}
        <section className="w-full px-8 lg:px-12 py-10">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                Featured Rentals
              </h2>
              <p className="text-muted-foreground mt-1">
                Browse curated rentals. Click a card to view details.
              </p>
            </div>

            {/* Optional: link to /browse */}
            <a
              href="/browse"
              className="text-sm font-medium text-primary hover:underline"
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
            <div className="w-full columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 [column-gap:1rem]">
              {featuredListings.map((listing) => (
                <div
                  key={listing.id}
                  className="mb-4 break-inside-avoid inline-block w-full relative hover:z-10"
                >
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
